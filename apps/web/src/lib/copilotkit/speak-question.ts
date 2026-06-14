type SpeakQuestionDeps = {
  AudioCtor?: typeof Audio;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtteranceCtor?: typeof SpeechSynthesisUtterance;
  generateSpeech?: (text: string) => Promise<{ data: ArrayBuffer; sampleRate: number }>;
  preloadKokoro?: () => Promise<boolean>;
};

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

async function defaultGenerateSpeech(text: string) {
  const { generateSpeech } = await import("./kokoro-worker-client");
  return generateSpeech(text);
}

async function defaultPreloadKokoro() {
  const { preloadKokoro: clientPreload } = await import("./kokoro-worker-client");
  return clientPreload();
}

async function speakWithKokoro(question: string, deps: SpeakQuestionDeps) {
  const gen = deps.generateSpeech ?? defaultGenerateSpeech;
  const { data } = await gen(question);
  const blob = new Blob([data], { type: "audio/wav" });
  await playBlob(blob, deps);
}

/**
 * Eagerly download and compile the local Kokoro TTS model in a Web Worker so
 * the first spoken question plays without the multi-second cold-start stall.
 * Safe to call repeatedly: the underlying model promise is memoized inside the
 * worker and shared with {@link speakQuestion}. Best-effort — failures are
 * swallowed and {@link speakQuestion} falls back to browser speech synthesis.
 */
export async function preloadKokoro(
  deps: { preloadKokoro?: () => Promise<boolean> } = {},
): Promise<boolean> {
  try {
    const preload = deps.preloadKokoro ?? defaultPreloadKokoro;
    return await preload();
  } catch {
    return false;
  }
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
