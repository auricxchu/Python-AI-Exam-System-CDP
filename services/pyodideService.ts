
// Check if the environment supports SharedArrayBuffer (Requires Secure Context + COOP/COEP headers)
const supportsSAB = typeof SharedArrayBuffer !== 'undefined';

// Worker Code as a string
const workerCode = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide = null;
let stdinBuffer = null;
let dataBuffer = null;

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
  pyodide.setStdout({ write: (text) => postMessage({ type: 'output', text: normalizeOutput(text) }) });
  pyodide.setStderr({ write: (text) => postMessage({ type: 'output', text: "Error: " + normalizeOutput(text) }) });

  // Setup blocking input mechanism using Atomics
  pyodide.setStdin({
    stdin: () => {
      postMessage({ type: 'input_request' });
      Atomics.wait(stdinBuffer, 0, 0);
      Atomics.store(stdinBuffer, 0, 0);
      const sizeArr = new Int32Array(dataBuffer.buffer, 0, 1);
      const len = sizeArr[0];
      const textBytes = dataBuffer.slice(4, 4 + len);
      return new TextDecoder().decode(textBytes);
    }
  });
}

self.onmessage = async (e) => {
  const { type, code, sab, dataSab } = e.data;
  
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
      await pyodide.loadPackagesFromImports(code);
      const result = await pyodide.runPythonAsync(code);
      postMessage({ type: 'success', result });
    } catch (err) {
      postMessage({ type: 'output', text: "\\n" + err.toString() });
      postMessage({ type: 'success', result: "" });
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
let workerInputResolver: ((val: string) => void) | null = null;

// --- Main Thread Mode State ---
let mainPyodide: any = null;
let mainReadyPromise: Promise<void> | null = null;

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js";
let scriptLoadPromise: Promise<void> | null = null;

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
      const { type, text } = e.data;
      if (type === 'ready') resolve();
      else if (type === 'output' && workerOutputCallback) workerOutputCallback(text);
      else if (type === 'input_request' && workerInputResolver) workerInputResolver("");
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
  onInputRequest?: () => Promise<string>
): Promise<string> => {
  await initPyodide();

  if (supportsSAB) {
    // --- Run in Worker (Advanced Input UI) ---
    if (!worker) throw new Error("Worker failed to init");
    workerOutputCallback = onOutput;
    
    // Setup input handler bridging UI -> SharedBuffer -> Worker
    workerInputResolver = async () => {
      if (onInputRequest && sab && dataSab) {
          const userInput = await onInputRequest();
          const encoder = new TextEncoder();
          const bytes = encoder.encode(userInput);
          const int32View = new Int32Array(dataSab);
          const uint8View = new Uint8Array(dataSab);
          int32View[0] = bytes.length;
          uint8View.set(bytes, 4);
          const signalView = new Int32Array(sab);
          Atomics.store(signalView, 0, 1);
          Atomics.notify(signalView, 0);
      }
    };

    return new Promise((resolve) => {
      const originalHandler = worker!.onmessage;
      worker!.onmessage = (e) => {
          const { type, text, result } = e.data;
          if (type === 'success') {
              worker!.onmessage = originalHandler;
              resolve(result || "");
          } else if (type === 'output') {
              if (workerOutputCallback) workerOutputCallback(text);
          } else if (type === 'input_request') {
              if (workerInputResolver) workerInputResolver("");
          }
      };
      worker!.postMessage({ type: 'run', code });
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
      const result = await mainPyodide.runPythonAsync(code);
      return result || "";
    } catch (err: any) {
      onOutput("\n" + err.toString());
      return "";
    }
  }
};
