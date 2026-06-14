/// <reference lib="webworker" />

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_VOICE = "af_sky" as const;
const KOKORO_SAMPLE_RATE = 24_000;
const MAX_CHUNK_LENGTH = 300;
const MAX_QUEUE_SIZE = 6;

type KokoroAudio = { audio: Float32Array; sampling_rate: number };
type KokoroInstance = {
  generate: (text: string, opts: { voice: string; speed?: number }) => Promise<KokoroAudio>;
};

let ttsPromise: Promise<KokoroInstance> | undefined;
let shouldStop = false;
let bufferQueueSize = 0;

function splitText(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  const chunks: string[] = [];

  for (const para of text.split(/\n{2,}/)) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    let current = "";
    for (const sentence of trimmed.split(/(?<=[.?!])\s+/)) {
      const s = sentence.trim();
      if (!s) continue;
      if (current.length + s.length + 1 <= maxLength) {
        current = current ? `${current} ${s}` : s;
      } else {
        if (current) chunks.push(current);
        if (s.length > maxLength) {
          let sub = "";
          for (const part of s.split(/,\s*/)) {
            if (sub.length + part.length + 2 <= maxLength) {
              sub = sub ? `${sub}, ${part}` : part;
            } else {
              if (sub) chunks.push(sub.trim());
              sub = part;
            }
          }
          current = sub;
        } else {
          current = s;
        }
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

async function detectWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

async function getTts(): Promise<KokoroInstance> {
  if (!ttsPromise) {
    const hasWebGPU = await detectWebGPU();
    const device = hasWebGPU ? "webgpu" : "wasm";
    const dtype = device === "wasm" ? "q8" : "fp32";

    postMessage({ status: "loading_model_start", device });

    const { KokoroTTS } = await import("kokoro-js");
    ttsPromise = KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype,
      device,
      progress_callback: (progress: unknown) => {
        postMessage({ status: "loading_model_progress", progress });
      },
    }) as Promise<KokoroInstance>;
  }
  return ttsPromise;
}

addEventListener("message", async (event: MessageEvent) => {
  const msg = event.data as {
    type: string;
    id?: number;
    text?: string;
    voice?: string;
    speed?: number;
  };

  if (msg.type === "preload") {
    try {
      await getTts();
      postMessage({ type: "ready" });
    } catch (error) {
      ttsPromise = undefined;
      postMessage({
        type: "error",
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
    return;
  }

  if (msg.type === "buffer_processed") {
    bufferQueueSize = Math.max(0, bufferQueueSize - 1);
    return;
  }

  if (msg.type === "stop") {
    shouldStop = true;
    return;
  }

  if (msg.type === "generate") {
    shouldStop = false;
    bufferQueueSize = 0;

    try {
      const tts = await getTts();
      const chunks = splitText(msg.text ?? "");

      if (chunks.length === 0) {
        postMessage({ status: "complete", id: msg.id });
        return;
      }

      for (const chunk of chunks) {
        if (shouldStop) break;

        // Back-pressure: wait until the player has consumed enough buffers
        while (bufferQueueSize >= MAX_QUEUE_SIZE) {
          if (shouldStop) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        if (shouldStop) break;

        const audio = await tts.generate(chunk, {
          voice: msg.voice ?? KOKORO_VOICE,
          speed: typeof msg.speed === "number" ? msg.speed : 1,
        });

        const pcm = audio.audio;
        const sampleRate = audio.sampling_rate ?? KOKORO_SAMPLE_RATE;

        // Slice to get a standalone ArrayBuffer (pcm may be a view into a larger buffer)
        const ab = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);

        bufferQueueSize++;
        (self as unknown as DedicatedWorkerGlobalScope).postMessage(
          { status: "stream_audio_data", id: msg.id, audio: ab, sampleRate },
          [ab],
        );
      }

      if (!shouldStop) {
        postMessage({ status: "complete", id: msg.id });
      }
    } catch (error) {
      postMessage({
        type: "error",
        id: msg.id,
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
});
