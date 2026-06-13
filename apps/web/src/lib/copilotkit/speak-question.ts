type SpeakQuestionDeps = {
  AudioCtor?: typeof Audio;
  createObjectURL?: (blob: Blob) => string;
  importKokoro?: () => Promise<KokoroModule>;
  revokeObjectURL?: (url: string) => void;
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtteranceCtor?: typeof SpeechSynthesisUtterance;
};

type KokoroPackage = typeof import("kokoro-js");
type KokoroModule = Pick<KokoroPackage, "KokoroTTS">;
type KokoroTts = Awaited<ReturnType<KokoroPackage["KokoroTTS"]["from_pretrained"]>>;

type KokoroAudio = {
  blob?: () => Blob | Promise<Blob>;
  buffer?: Float32Array | Int16Array | Uint8Array | ArrayBuffer;
  data?: Float32Array | Int16Array | Uint8Array;
  sample_rate?: number;
  sampling_rate?: number;
  toBlob?: () => Blob | Promise<Blob>;
};

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-ONNX";
const KOKORO_VOICE = "af_sky" as const;
const KOKORO_SAMPLE_RATE = 24_000;

let kokoroTtsPromise: Promise<KokoroTts> | undefined;

function getBrowserSpeech(deps: SpeakQuestionDeps) {
  const speech = deps.speechSynthesis ?? globalThis.speechSynthesis;
  const Utterance = deps.SpeechSynthesisUtteranceCtor ?? globalThis.SpeechSynthesisUtterance;
  return { speech, Utterance };
}

function speakWithBrowserSpeech(question: string, deps: SpeakQuestionDeps, message: string) {
  const { speech, Utterance } = getBrowserSpeech(deps);
  if (!speech || !Utterance) {
    return `${message} Browser speech synthesis is unavailable.`;
  }
  speech.cancel();
  speech.speak(new Utterance(question));
  return message;
}

function getObjectUrlApi(deps: SpeakQuestionDeps) {
  return {
    createObjectURL: deps.createObjectURL ?? globalThis.URL.createObjectURL.bind(globalThis.URL),
    revokeObjectURL: deps.revokeObjectURL ?? globalThis.URL.revokeObjectURL.bind(globalThis.URL),
  };
}

function pcmToWavBlob(data: Float32Array | Int16Array | Uint8Array, sampleRate: number) {
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
    const value =
      data instanceof Float32Array ? Math.max(-1, Math.min(1, sample)) * 0x7fff : sample;
    view.setInt16(offset, value, true);
    offset += bytesPerSample;
  }

  return new Blob([wav], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function audioToBlob(audio: KokoroAudio) {
  if (audio.toBlob) return audio.toBlob();
  if (audio.blob) return audio.blob();
  if (audio.data) {
    return pcmToWavBlob(audio.data, audio.sampling_rate ?? audio.sample_rate ?? KOKORO_SAMPLE_RATE);
  }
  if (
    audio.buffer instanceof Float32Array ||
    audio.buffer instanceof Int16Array ||
    audio.buffer instanceof Uint8Array
  ) {
    return pcmToWavBlob(
      audio.buffer,
      audio.sampling_rate ?? audio.sample_rate ?? KOKORO_SAMPLE_RATE,
    );
  }
  if (audio.buffer instanceof ArrayBuffer) {
    return new Blob([audio.buffer], { type: "audio/wav" });
  }
  throw new Error("Kokoro returned audio in an unsupported format");
}

async function playBlob(blob: Blob, deps: SpeakQuestionDeps) {
  const AudioPlayer = deps.AudioCtor ?? globalThis.Audio;
  const { createObjectURL, revokeObjectURL } = getObjectUrlApi(deps);
  const url = createObjectURL(blob);
  const player = new AudioPlayer(url);
  try {
    await player.play();
    player.addEventListener("ended", () => revokeObjectURL(url), { once: true });
    player.addEventListener("error", () => revokeObjectURL(url), { once: true });
  } catch (error) {
    revokeObjectURL(url);
    throw error;
  }
}

async function loadKokoro(importKokoro?: () => Promise<KokoroModule>): Promise<KokoroTts> {
  if (importKokoro) {
    const { KokoroTTS } = await importKokoro();
    return KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: "q8", device: "wasm" });
  }
  kokoroTtsPromise ??= defaultImportKokoro().then(({ KokoroTTS }) =>
    KokoroTTS.from_pretrained(KOKORO_MODEL_ID, { dtype: "q8", device: "wasm" }),
  );
  return kokoroTtsPromise;
}

function defaultImportKokoro() {
  return import("kokoro-js");
}

async function speakWithKokoro(question: string, deps: SpeakQuestionDeps) {
  const tts = await loadKokoro(deps.importKokoro);
  const audio = await tts.generate(question, { voice: KOKORO_VOICE });
  await playBlob(await audioToBlob(audio), deps);
}

export async function speakQuestion(
  question: string,
  deps: SpeakQuestionDeps = {},
): Promise<string> {
  try {
    await speakWithKokoro(question, deps);
    return "Used local Kokoro TTS.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    kokoroTtsPromise = undefined;
    return speakWithBrowserSpeech(
      question,
      deps,
      `Local Kokoro TTS unavailable (${detail}); used browser speech synthesis.`,
    );
  }
}

export function speakQuestionWithBrowserSpeech(
  question: string,
  deps: SpeakQuestionDeps = {},
): string {
  return speakWithBrowserSpeech(question, deps, "Used browser speech synthesis.");
}
