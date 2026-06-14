/// <reference lib="webworker" />

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
const KOKORO_VOICE = "af_sky" as const;
const KOKORO_SAMPLE_RATE = 24_000;

let ttsPromise: Promise<unknown> | undefined;

function pcmToWavBlob(data: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const wav = new ArrayBuffer(44 + data.length * bytesPerSample);
  const view = new DataView(wav);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + data.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, data.length * bytesPerSample, true);

  let offset = 44;
  for (const sample of data) {
    const value = Math.max(-1, Math.min(1, sample)) * 0x7fff;
    view.setInt16(offset, value, true);
    offset += bytesPerSample;
  }

  return new Blob([wav], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

async function getTts() {
  if (!ttsPromise) {
    const { KokoroTTS } = await import("kokoro-js");
    ttsPromise = KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: "q8",
      device: "wasm",
    });
  }
  return ttsPromise as Promise<{
    generate: (text: string, opts: { voice: string; speed?: number }) => unknown;
  }>;
}

addEventListener("message", async (event: MessageEvent) => {
  const msg = event.data;

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

  if (msg.type === "generate") {
    try {
      const tts = await getTts();
      const audio: any = await tts.generate(msg.text, {
        voice: KOKORO_VOICE,
        speed: typeof msg.speed === "number" ? msg.speed : 1,
      });

      const data: Float32Array | undefined = audio.data ?? audio.buffer;
      const sampleRate = audio.sampling_rate ?? audio.sample_rate ?? KOKORO_SAMPLE_RATE;

      let arrayBuffer: ArrayBuffer;

      if (data instanceof Float32Array) {
        arrayBuffer = await pcmToWavBlob(data, sampleRate).arrayBuffer();
      } else if (audio.toBlob) {
        arrayBuffer = await (await audio.toBlob()).arrayBuffer();
      } else if (audio.blob) {
        arrayBuffer = await (await audio.blob()).arrayBuffer();
      } else if (audio instanceof ArrayBuffer) {
        arrayBuffer = audio;
      } else {
        throw new Error("Kokoro returned audio in an unsupported format");
      }

      postMessage(
        { type: "result", id: msg.id, data: arrayBuffer, sampleRate },
        { transfer: [arrayBuffer] },
      );
    } catch (error) {
      postMessage({
        type: "error",
        id: msg.id,
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
});
