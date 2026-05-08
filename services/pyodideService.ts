
// Check if the environment supports SharedArrayBuffer (Requires Secure Context + COOP/COEP headers)
const supportsSAB = typeof SharedArrayBuffer !== 'undefined';
const PYODIDE_LOCAL_INDEX_URL = new URL('pyodide/', window.location.href).toString();
const PYODIDE_CDN_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/";
const PYODIDE_SCRIPT_CANDIDATES = [
  new URL('pyodide.js', PYODIDE_LOCAL_INDEX_URL).toString(),
  new URL('pyodide.js', PYODIDE_CDN_INDEX_URL).toString()
];

// Worker Code as a string
const workerCode = `
const FALLBACK_PYODIDE_INDEX_URL = ${JSON.stringify(PYODIDE_CDN_INDEX_URL)};

let pyodide = null;
let stdinBuffer = null;
let dataBuffer = null;
let sessionGlobals = new Map();
let currentSessionId = null;
let activeIndexURL = FALLBACK_PYODIDE_INDEX_URL;

const getIndexUrlCandidates = (preferredIndexURL) => {
  const candidates = [preferredIndexURL, FALLBACK_PYODIDE_INDEX_URL].filter(Boolean);
  return [...new Set(candidates)];
};

async function ensurePyodideRuntime(preferredIndexURL) {
  let lastError = null;
  for (const candidate of getIndexUrlCandidates(preferredIndexURL)) {
    try {
      importScripts(new URL('pyodide.js', candidate).toString());
      activeIndexURL = candidate;
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to load Pyodide runtime');
}

async function init(sab, dataSab, indexURL) {
  stdinBuffer = new Int32Array(sab);
  dataBuffer = new Uint8Array(dataSab);

  await ensurePyodideRuntime(indexURL);
  let lastError = null;
  for (const candidate of getIndexUrlCandidates(activeIndexURL)) {
    try {
      pyodide = await loadPyodide({ indexURL: candidate });
      activeIndexURL = candidate;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!pyodide) {
    throw lastError || new Error('Failed to initialize Pyodide');
  }
  
  const normalizeOutput = (chunk) => {
    if (typeof chunk === 'string') return chunk;
    if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
    if (chunk instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(chunk));
    return String(chunk ?? '');
  };

  // Setup output streams — Pyodide 0.25 uses { raw: fn } for per-write callbacks
  pyodide.setStdout({ raw: (text) => {
    postMessage({ type: 'output', text: normalizeOutput(text), sessionId: currentSessionId });
  }});
  pyodide.setStderr({ raw: (text) => {
    postMessage({ type: 'output', text: "Error: " + normalizeOutput(text), sessionId: currentSessionId });
  }});

  // Setup blocking input mechanism using Atomics
  pyodide.setStdin({
    stdin: () => {
      postMessage({ type: 'input_request', sessionId: currentSessionId });
      Atomics.wait(stdinBuffer, 0, 0);
      Atomics.store(stdinBuffer, 0, 0);
      const sizeArr = new Int32Array(dataBuffer.buffer, 0, 1);
      const len = sizeArr[0];
      const textBytes = dataBuffer.slice(4, 4 + len);
      return new TextDecoder().decode(textBytes);
    }
  });
}

const ensureSessionGlobals = (sessionId) => {
  if (!sessionId) return null;
  if (sessionGlobals.has(sessionId)) return sessionGlobals.get(sessionId);
  const dictFactory = pyodide.globals.get('dict');
  const globals = dictFactory();
  globals.set('__builtins__', pyodide.globals.get('__builtins__'));
  sessionGlobals.set(sessionId, globals);
  return globals;
};

self.onmessage = async (e) => {
  const { type, code, sab, dataSab, sessionId, indexURL } = e.data;
  
  if (type === 'init') {
    try {
        await init(sab, dataSab, indexURL);
        postMessage({ type: 'ready' });
    } catch (e) {
        postMessage({ type: 'output', text: "Init Error: " + e.message });
    }
  }
  
  if (type === 'run') {
    try {
      currentSessionId = sessionId || null;
      await pyodide.loadPackagesFromImports(code);
      const globals = ensureSessionGlobals(sessionId);
      const result = globals
        ? await pyodide.runPythonAsync(code, { globals })
        : await pyodide.runPythonAsync(code);
      postMessage({ type: 'success', result, sessionId: currentSessionId });
    } catch (err) {
      const errText = err.toString();
      if (errText.includes('Errno 29')) {
        postMessage({ type: 'io_error', text: errText, sessionId: currentSessionId });
        return;
      }
      postMessage({ type: 'output', text: "\\n" + errText, sessionId: currentSessionId });
      postMessage({ type: 'success', result: "", sessionId: currentSessionId });
    }
  }
};
`;

// --- Worker Mode State ---
let worker: Worker | null = null;
let sab: SharedArrayBuffer | null = null;
let dataSab: SharedArrayBuffer | null = null;
let workerReadyPromise: Promise<void> | null = null;
let workerOutputCallback: ((text: string) => void) | null = null;
let workerInputResolver: (() => void) | null = null;
const DEFAULT_SESSION_KEY = '__default__';
const workerOutputCallbacks = new Map<string, (text: string) => void>();
const workerInputResolvers = new Map<string, () => void>();
let workerRunResolver: ((result: string) => void) | null = null;
let workerRunSessionKey: string | null = null;
let runTokenCounter = 0;
const activeRunTokens = new Map<string, number>();

// --- Main Thread Mode State ---
let mainPyodide: any = null;
let mainReadyPromise: Promise<void> | null = null;
const mainSessionGlobals = new Map<string, any>();

let scriptLoadPromise: Promise<void> | null = null;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.head.appendChild(script);
  });

const feedInputBuffer = (text: string) => {
  if (!sab || !dataSab) return;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const int32View = new Int32Array(dataSab);
  const uint8View = new Uint8Array(dataSab);
  int32View[0] = bytes.length;
  uint8View.set(bytes, 4);
  const signalView = new Int32Array(sab);
  Atomics.store(signalView, 0, 1);
  Atomics.notify(signalView, 0);
};

const releaseStdinWait = () => {
  if (!sab || !dataSab) return;
  const int32View = new Int32Array(dataSab);
  int32View[0] = 0;
  const signalView = new Int32Array(sab);
  Atomics.store(signalView, 0, 1);
  Atomics.notify(signalView, 0);
};

export const resetPyodideWorker = () => {
  if (worker) {
    worker.terminate();
  }
  worker = null;
  sab = null;
  dataSab = null;
  workerReadyPromise = null;
  workerOutputCallback = null;
  workerInputResolver = null;
  workerOutputCallbacks.clear();
  workerInputResolvers.clear();
  workerRunResolver = null;
  workerRunSessionKey = null;
  activeRunTokens.clear();
};

export const resetPyodideRuntime = () => {
  resetPyodideWorker();
  mainPyodide = null;
  mainReadyPromise = null;
  mainSessionGlobals.clear();
};

export const abortPyodideRun = (sessionId?: string) => {
  const sessionKey = sessionId || DEFAULT_SESSION_KEY;
  if (workerRunResolver && (!workerRunSessionKey || workerRunSessionKey === sessionKey)) {
    const done = workerRunResolver;
    workerRunResolver = null;
    workerRunSessionKey = null;
    activeRunTokens.delete(sessionKey);
    workerInputResolvers.delete(sessionKey);
    releaseStdinWait();
    done("");
  }
};

const ensurePyodideScriptLoaded = async () => {
  // @ts-ignore
  if (typeof loadPyodide !== 'undefined') return;
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = (async () => {
    let lastError: unknown = null;
    for (const src of [...new Set(PYODIDE_SCRIPT_CANDIDATES)]) {
      try {
        await loadScript(src);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Failed to load Pyodide script");
  })();

  return scriptLoadPromise;
};

const getMainSessionGlobals = (sessionId?: string) => {
  if (!sessionId || !mainPyodide) return null;
  if (mainSessionGlobals.has(sessionId)) return mainSessionGlobals.get(sessionId);
  const dictFactory = mainPyodide.globals.get('dict');
  const globals = dictFactory();
  globals.set('__builtins__', mainPyodide.globals.get('__builtins__'));
  mainSessionGlobals.set(sessionId, globals);
  return globals;
};

// Initialize Pyodide (Auto-selects mode)
export const initPyodide = async () => {
  if (supportsSAB) {
    return initWorkerMode();
  } else {
    console.warn("SharedArrayBuffer not supported. Falling back to Main Thread mode (using window.prompt for input).");
    return initMainThreadMode();
  }
};

// Mode 1: Worker Initialization
const initWorkerMode = async () => {
  if (worker) return workerReadyPromise;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  worker = new Worker(URL.createObjectURL(blob));

  sab = new SharedArrayBuffer(4); 
  dataSab = new SharedArrayBuffer(1024 * 64);

  workerReadyPromise = new Promise((resolve) => {
    if (!worker) return;
    worker.onmessage = (e) => {
      const { type, text, result, sessionId } = e.data;
      const sessionKey = sessionId || DEFAULT_SESSION_KEY;
      if (type === 'ready') resolve();
      else if (type === 'output') {
        const cb = workerOutputCallbacks.get(sessionKey);
        if (cb) cb(text);
        else if (sessionKey === DEFAULT_SESSION_KEY && workerOutputCallback) workerOutputCallback(text);
      } else if (type === 'input_request') {
        const token = activeRunTokens.get(sessionKey);
        if (!token) {
          feedInputBuffer("");
          return;
        }
        const resolver = workerInputResolvers.get(sessionKey);
        if (resolver) resolver();
        else if (sessionKey === DEFAULT_SESSION_KEY && workerInputResolver) workerInputResolver();
        else feedInputBuffer("");
      } else if (type === 'io_error') {
        if (workerRunResolver && (!workerRunSessionKey || workerRunSessionKey === sessionKey)) {
          const done = workerRunResolver;
          workerRunResolver = null;
          workerRunSessionKey = null;
          activeRunTokens.delete(sessionKey);
          workerInputResolvers.delete(sessionKey);
          done("");
        }
        resetPyodideWorker();
      } else if (type === 'success') {
        if (workerRunResolver && (!workerRunSessionKey || workerRunSessionKey === sessionKey)) {
          const done = workerRunResolver;
          workerRunResolver = null;
          workerRunSessionKey = null;
          activeRunTokens.delete(sessionKey);
          workerInputResolvers.delete(sessionKey);
          done(result || "");
        }
      }
    };
    worker.postMessage({ type: 'init', sab, dataSab, indexURL: PYODIDE_LOCAL_INDEX_URL });
  });

  return workerReadyPromise;
};

// Mode 2: Main Thread Initialization
const initMainThreadMode = async () => {
  if (mainPyodide) return;
  if (mainReadyPromise) return mainReadyPromise;

  mainReadyPromise = (async () => {
    // Load Pyodide script on demand to avoid blocking initial page load
    await ensurePyodideScriptLoaded();
    // @ts-ignore
    if (typeof loadPyodide === 'undefined') {
      throw new Error("Pyodide script is not available after loading");
    }
    // @ts-ignore
    mainPyodide = await loadPyodide({ indexURL: PYODIDE_LOCAL_INDEX_URL });
    console.log("Main Thread Pyodide Ready");
  })().catch(async (error) => {
    console.warn("Local Pyodide assets unavailable, falling back to CDN.", error);
    scriptLoadPromise = null;
    await ensurePyodideScriptLoaded();
    // @ts-ignore
    mainPyodide = await loadPyodide({ indexURL: PYODIDE_CDN_INDEX_URL });
  });

  return mainReadyPromise;
};

export const runPythonCodeLocal = async (
  code: string, 
  onOutput: (text: string) => void,
  onInputRequest?: () => Promise<string>,
  sessionId?: string
): Promise<string> => {
  await initPyodide();

  if (supportsSAB) {
    // --- Run in Worker (Advanced Input UI) ---
    if (!worker) throw new Error("Worker failed to init");
    const sessionKey = sessionId || DEFAULT_SESSION_KEY;
    const runToken = ++runTokenCounter;
    activeRunTokens.set(sessionKey, runToken);
    workerOutputCallback = onOutput;
    workerOutputCallbacks.set(sessionKey, onOutput);
    
    // Setup input handler bridging UI -> SharedBuffer -> Worker
    workerInputResolver = async () => {
      const activeToken = activeRunTokens.get(sessionKey);
      if (!activeToken || activeToken !== runToken) {
        feedInputBuffer("");
        return;
      }
      if (onInputRequest && sab && dataSab) {
          let attempts = 0;
          while (true) {
            const userInput = await onInputRequest();
            if (userInput !== "" || attempts >= 1) {
              feedInputBuffer(userInput || "");
              break;
            }
            attempts += 1;
          }
      } else {
          feedInputBuffer("");
      }
    };
    workerInputResolvers.set(sessionKey, workerInputResolver);

    return new Promise((resolve) => {
      if (workerRunResolver) {
        console.warn("Pyodide worker is already running a task; queuing is not supported.");
        activeRunTokens.delete(sessionKey);
        resolve("");
        return;
      }
      workerRunResolver = (result) => {
        resolve(result || "");
      };
      workerRunSessionKey = sessionKey;
      worker!.postMessage({ type: 'run', code, sessionId: sessionKey });
    });

  } else {
    // --- Run in Main Thread (Fallback / Simple Input) ---
    if (!mainPyodide) throw new Error("Main thread Pyodide failed to init");

    const normalizeOutput = (chunk: any) => {
      if (typeof chunk === "string") return chunk;
      if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
      if (chunk instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(chunk));
      return String(chunk ?? "");
    };

    // Configure streams for this run
    // Use write to show prompt text immediately (no newline buffering)
    mainPyodide.setStdout({ raw: (text: any) => onOutput(normalizeOutput(text)) });
    mainPyodide.setStderr({ raw: (text: any) => onOutput("Error: " + normalizeOutput(text)) });
    
    // Fallback: Use window.prompt because main thread cannot block asynchronously without prompt()
    mainPyodide.setStdin({
      stdin: () => {
        const val = prompt("程序请求输入 (Input):");
        // Print the input to console so user sees what they typed in the log
        onOutput(val + "\n");
        return val || "";
      }
    });

    try {
      await mainPyodide.loadPackagesFromImports(code);
      const globals = getMainSessionGlobals(sessionId);
      const result = globals
        ? await mainPyodide.runPythonAsync(code, { globals })
        : await mainPyodide.runPythonAsync(code);
      return result || "";
    } catch (err: any) {
      onOutput("\n" + err.toString());
      return "";
    }
  }
};
