type SpeakQuestionDeps = {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtteranceCtor?: typeof SpeechSynthesisUtterance;
  generateSpeech?: (text: string, speed?: number) => Promise<void>;
  preloadKokoro?: () => Promise<boolean>;
  speed?: number;
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
  const utterance = new Utterance(question);
  if (deps.speed != null) utterance.rate = deps.speed;
  speech.speak(utterance);
  return message;
}

async function defaultGenerateSpeech(text: string, speed?: number): Promise<void> {
  const { generateSpeech } = await import("./kokoro-worker-client");
  return generateSpeech(text, speed);
}

async function defaultPreloadKokoro() {
  const { preloadKokoro: clientPreload } = await import("./kokoro-worker-client");
  return clientPreload();
}

async function speakWithKokoro(question: string, deps: SpeakQuestionDeps): Promise<void> {
  const gen = deps.generateSpeech ?? defaultGenerateSpeech;
  await gen(question, deps.speed);
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

export async function speak(text: string, deps: SpeakQuestionDeps = {}): Promise<string> {
  try {
    await speakWithKokoro(text, deps);
    return "Used local Kokoro TTS.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return speakWithBrowserSpeech(
      text,
      deps,
      `Local Kokoro TTS unavailable (${detail}); used browser speech synthesis.`,
    );
  }
}

export async function speakQuestion(
  question: string,
  deps: SpeakQuestionDeps = {},
): Promise<string> {
  // Kokoro's default; kept explicit so the deps record is honest.
  return speak(question, { ...deps, speed: deps.speed ?? 1 });
}

export function stopSpeaking(deps: Pick<SpeakQuestionDeps, "speechSynthesis"> = {}): void {
  const speech = deps.speechSynthesis ?? globalThis.speechSynthesis;
  speech?.cancel();
  void import("./kokoro-worker-client").then(({ stopSpeechWorker }) => stopSpeechWorker());
}
