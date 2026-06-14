type GenerateResult = { data: ArrayBuffer; sampleRate: number };

type PendingRequest = {
  resolve: (result: GenerateResult) => void;
  reject: (error: Error) => void;
};

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.addEventListener("message", (event: MessageEvent) => {
      const msg = event.data;

      if (msg.type === "result") {
        const req = pending.get(msg.id);
        if (req) {
          pending.delete(msg.id);
          req.resolve({ data: msg.data, sampleRate: msg.sampleRate });
        }
        return;
      }

      if (msg.type === "error" && msg.id != null) {
        const req = pending.get(msg.id);
        if (req) {
          pending.delete(msg.id);
          req.reject(new Error(msg.message));
        }
        return;
      }
    });

    worker.addEventListener("error", (event: ErrorEvent) => {
      for (const [, req] of pending) {
        req.reject(new Error(event.message));
      }
      pending.clear();
    });
  }
  return worker;
}

export async function preloadKokoro(): Promise<boolean> {
  try {
    const w = getWorker();

    await new Promise<void>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const msg = event.data;
        if (msg.type === "ready") {
          w.removeEventListener("message", handler);
          resolve();
        } else if (msg.type === "error" && msg.id == null) {
          w.removeEventListener("message", handler);
          reject(new Error(msg.message));
        }
      };
      w.addEventListener("message", handler);
      // Worker.postMessage doesn't take targetOrigin — this is not Window.postMessage
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      w.postMessage({ type: "preload" });
    });

    return true;
  } catch {
    return false;
  }
}

export async function generateSpeech(text: string): Promise<GenerateResult> {
  const w = getWorker();
  const id = nextId++;

  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  w.postMessage({ type: "generate", id, text });

  return new Promise<GenerateResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });

    setTimeout(() => {
      const req = pending.get(id);
      if (req) {
        pending.delete(id);
        reject(new Error("TTS generation timed out after 30s"));
      }
    }, 30_000);
  });
}
