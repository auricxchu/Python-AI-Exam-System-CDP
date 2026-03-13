
// Check if the environment supports SharedArrayBuffer (Requires Secure Context + COOP/COEP headers)
const supportsSAB = typeof SharedArrayBuffer !== 'undefined';

// Worker Code as a string
const workerCode = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide = null;
let stdinBuffer = null;
let dataBuffer = null;
let sessionGlobals = new Map();
let currentSessionId = null;

async function init(sab, dataSab) {
  stdinBuffer = new Int32Array(sab);
  dataBuffer = new Uint8Array(dataSab);
  
  pyodide = await loadPyodide();
  
  const normalizeOutput = (chunk) => {
    if (typeof chunk === 'string') return chunk;
    if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
    if (chunk instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(chunk));
    return String(chunk ?? '');
  };

  // Setup output streams (use write to flush prompt text immediately)
  const emitOutput = (text, isError = false) => {
    const payload = isError ? "Error: " + normalizeOutput(text) : normalizeOutput(text);
    postMessage({ type: 'output', text: payload, sessionId: currentSessionId });
  };
  pyodide.setStdout({ write: (text) => emitOutput(text) });
  pyodide.setStderr({ write: (text) => emitOutput(text, true) });

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
  const { type, code, sab, dataSab, sessionId } = e.data;
  
  if (type === 'init') {
    try {
        await init(sab, dataSab);
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

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js";
let scriptLoadPromise: Promise<void> | null = null;

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

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PYODIDE_CDN;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pyodide script"));
    document.head.appendChild(script);
  });

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
    worker.postMessage({ type: 'init', sab, dataSab });
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
    mainPyodide = await loadPyodide();
    console.log("Main Thread Pyodide Ready");
  })();

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
    releaseStdinWait();
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
          const userInput = await onInputRequest();
          feedInputBuffer(userInput || "");
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
    mainPyodide.setStdout({ write: (text: any) => onOutput(normalizeOutput(text)) });
    mainPyodide.setStderr({ write: (text: any) => onOutput("Error: " + normalizeOutput(text)) });
    
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
