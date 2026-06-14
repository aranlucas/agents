import { describe, expect, it, vi } from "vitest";

import { preloadKokoro, speak, speakQuestion, stopSpeaking } from "./speak-question";

class MockUtterance {
  rate?: number;
  constructor(public text: string) {}
}

describe("speakQuestion", () => {
  it("uses local Kokoro TTS by default", async () => {
    const generateSpeech = vi.fn().mockResolvedValue(undefined);

    const result = await speakQuestion("What is your diagnosis?", { generateSpeech });

    expect(result).toBe("Used local Kokoro TTS.");
    // speakQuestion wrapper passes speed: 1 explicitly
    expect(generateSpeech).toHaveBeenCalledWith("What is your diagnosis?", 1);
  });

  it("passes speed through to generateSpeech", async () => {
    const generateSpeech = vi.fn().mockResolvedValue(undefined);

    await speak("Read slowly.", { speed: 0.8, generateSpeech });

    expect(generateSpeech).toHaveBeenCalledWith("Read slowly.", 0.8);
  });

  it("applies speed to the browser fallback rate", async () => {
    const speakFn = vi.fn();
    const utterances: MockUtterance[] = [];
    const SpeechSynthesisUtteranceCtor = class extends MockUtterance {
      constructor(text: string) {
        super(text);
        utterances.push(this);
      }
    } as unknown as typeof SpeechSynthesisUtterance;

    await speak("Speak slowly.", {
      speed: 0.8,
      generateSpeech: vi.fn().mockRejectedValue(new Error("model unavailable")),
      speechSynthesis: { cancel: vi.fn(), speak: speakFn } as unknown as SpeechSynthesis,
      SpeechSynthesisUtteranceCtor,
    });

    expect(utterances).toHaveLength(1);
    expect(utterances[0].rate).toBe(0.8);
    expect(speakFn).toHaveBeenCalledOnce();
  });

  it("falls back to browser speech when Kokoro is unavailable", async () => {
    const speakFn = vi.fn();

    const result = await speakQuestion("What is your diagnosis?", {
      generateSpeech: vi.fn().mockRejectedValue(new Error("model unavailable")),
      speechSynthesis: { cancel: vi.fn(), speak: speakFn } as unknown as SpeechSynthesis,
      SpeechSynthesisUtteranceCtor: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
    });

    expect(result).toBe(
      "Local Kokoro TTS unavailable (model unavailable); used browser speech synthesis.",
    );
    expect(speakFn).toHaveBeenCalledWith(
      expect.objectContaining({ text: "What is your diagnosis?" }),
    );
  });

  it("reports when Kokoro and browser speech synthesis are unavailable", async () => {
    const result = await speakQuestion("What is your diagnosis?", {
      generateSpeech: vi.fn().mockRejectedValue(new Error("model unavailable")),
      speechSynthesis: undefined,
      SpeechSynthesisUtteranceCtor: undefined,
    });

    expect(result).toBe(
      "Local Kokoro TTS unavailable (model unavailable); used browser speech synthesis. Browser speech synthesis is unavailable.",
    );
  });

  it("stopSpeaking cancels browser speech synthesis", () => {
    const cancelSpy = vi.fn();

    stopSpeaking({ speechSynthesis: { cancel: cancelSpy } as unknown as SpeechSynthesis });

    expect(cancelSpy).toHaveBeenCalledOnce();
  });
});

describe("preloadKokoro", () => {
  it("warms the model and reports success", async () => {
    const mockPreload = vi.fn().mockResolvedValue(true);

    const ok = await preloadKokoro({ preloadKokoro: mockPreload });

    expect(ok).toBe(true);
    expect(mockPreload).toHaveBeenCalledOnce();
  });

  it("swallows load failures and reports false", async () => {
    const ok = await preloadKokoro({
      preloadKokoro: vi.fn().mockRejectedValue(new Error("model unavailable")),
    });

    expect(ok).toBe(false);
  });
});
