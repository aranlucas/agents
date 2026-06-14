type StreamHandler = {
  onChunk: (ab: ArrayBuffer, sampleRate: number) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
};

let worker: Worker | undefined;
let nextId = 0;
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

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function enqueueAudio(ab: ArrayBuffer, sampleRate: number): void {
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
    // oxlint-disable-next-line eslint/no-await-in-loop
    if (ctx.state === "suspended") await ctx.resume();
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise<void>((resolve) => {
      source.addEventListener("ended", () => resolve(), { once: true });
      source.start();
    });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    w.postMessage({ type: "buffer_processed" });
  }

  isPlaying = false;
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
 * chunk through the Web Audio API as soon as it arrives. Resolves once the
 * first chunk starts playing (so callers aren't blocked for the full duration).
 */
export function generateSpeech(text: string, speed?: number): Promise<void> {
  const w = getWorker();
  const id = nextId++;

  // Clear pending audio from any previous utterance
  audioQueue = [];

  return new Promise<void>((resolve, reject) => {
    let resolved = false;

    streams.set(id, {
      onChunk(ab, sampleRate) {
        enqueueAudio(ab, sampleRate);
        if (!resolved) {
          resolved = true;
          resolve();
        }
      },
      onComplete() {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      },
      onError(err) {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      },
    });

    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    w.postMessage({ type: "generate", id, text, speed });

    setTimeout(() => {
      if (streams.has(id)) {
        streams.delete(id);
        if (!resolved) {
          resolved = true;
          reject(new Error("TTS generation timed out after 30s"));
        }
      }
    }, 30_000);
  });
}

export function stopSpeechWorker(): void {
  if (worker) {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    worker.postMessage({ type: "stop" });
  }
  audioQueue = [];
  isPlaying = false;
}
