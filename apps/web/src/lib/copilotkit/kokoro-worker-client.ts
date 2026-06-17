type StreamHandler = {
  onChunk: (ab: ArrayBuffer, sampleRate: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
};

let worker: Worker | undefined;
let nextId = 0;
let stopped = false;
const streams = new Map<number, StreamHandler>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });

    worker.addEventListener("message", (event: MessageEvent) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const msg = event.data as {
        type?: string;
        status?: string;
        id?: number;
        audio?: ArrayBuffer;
        sampleRate?: number;
        message?: string;
      };

      if (msg.status === "stream_audio_data" && msg.id != null) {
        streams.get(msg.id)?.onChunk(msg.audio!, msg.sampleRate!);
        return;
      }

      if (msg.status === "complete" && msg.id != null) {
        streams.get(msg.id)?.onComplete();
        streams.delete(msg.id);
        return;
      }

      if (msg.type === "error" && msg.id != null) {
        streams.get(msg.id)?.onError(new Error(msg.message ?? "unknown error"));
        streams.delete(msg.id);
      }
    });

    worker.addEventListener("error", (event: ErrorEvent) => {
      for (const [, handler] of streams) {
        handler.onError(new Error(event.message));
      }
      streams.clear();
    });
  }
  return worker;
}

// --- Web Audio API player ---

let audioCtx: AudioContext | undefined;
let audioQueue: AudioBuffer[] = [];
let isPlaying = false;
let currentSource: AudioBufferSourceNode | null = null;
let drainResolve: (() => void) | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function enqueueAudio(ab: ArrayBuffer, sampleRate: number): void {
  if (stopped) return;
  const ctx = getAudioContext();
  const pcm = new Float32Array(ab);
  const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
  buffer.getChannelData(0).set(pcm);
  audioQueue.push(buffer);
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (isPlaying || audioQueue.length === 0) return;
  isPlaying = true;
  const ctx = getAudioContext();
  const w = getWorker();

  while (audioQueue.length > 0) {
    const buffer = audioQueue.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSource = source;
    // oxlint-disable-next-line eslint/no-await-in-loop
    if (ctx.state === "suspended") await ctx.resume();
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise<void>((resolve) => {
      source.addEventListener("ended", () => resolve(), { once: true });
      source.start();
    });
    currentSource = null;
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    w.postMessage({ type: "buffer_processed" });
  }

  isPlaying = false;
  drainResolve?.();
  drainResolve = null;
}

function waitForDrain(): Promise<void> {
  if (!isPlaying && audioQueue.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    drainResolve = resolve;
  });
}

// ---

export async function preloadKokoro(): Promise<boolean> {
  try {
    const w = getWorker();
    await new Promise<void>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const msg = event.data as { type?: string; message?: string; id?: number };
        if (msg.type === "ready") {
          w.removeEventListener("message", handler);
          resolve();
        } else if (msg.type === "error" && msg.id == null) {
          w.removeEventListener("message", handler);
          reject(new Error(msg.message));
        }
      };
      w.addEventListener("message", handler);
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      w.postMessage({ type: "preload" });
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends text to the Kokoro worker for streaming TTS generation and plays each
 * chunk through the Web Audio API as soon as it arrives. Resolves once all
 * audio has finished rendering AND playing.
 */
export function generateSpeech(text: string, speed?: number): Promise<void> {
  const w = getWorker();
  const id = nextId++;

  // Clear pending audio from any previous utterance
  audioQueue = [];
  stopped = false;

  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve();
    };

    const fail = (err: Error) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    };

    streams.set(id, {
      onChunk(ab, sampleRate) {
        enqueueAudio(ab, sampleRate);
      },
      onComplete() {
        void waitForDrain().then(finish);
      },
      onError(err) {
        fail(err);
      },
    });

    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    w.postMessage({ type: "generate", id, text, speed });

    timeoutId = setTimeout(() => {
      if (streams.has(id)) {
        streams.delete(id);
        fail(new Error("TTS generation timed out after 30s"));
      }
    }, 30_000);
  });
}

export function stopSpeechWorker(): void {
  stopped = true;
  if (worker) {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage({ type: "stop" });
  }
  audioQueue = [];
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // stop() throws if the source has already ended
    }
    currentSource = null;
  }
  isPlaying = false;
  for (const [id, handler] of streams) {
    handler.onComplete();
    streams.delete(id);
  }
  drainResolve?.();
  drainResolve = null;
}
