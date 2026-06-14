import { describe, expect, it, vi } from "vitest";

import { preloadKokoro, speakQuestion } from "./speak-question";

class MockUtterance {
  constructor(public text: string) {}
}

describe("speakQuestion", () => {
  it("uses local Kokoro TTS by default", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const generateSpeech = vi.fn().mockResolvedValue({
      data: new ArrayBuffer(44),
      sampleRate: 24000,
    });

    const result = await speakQuestion("What is your diagnosis?", {
      AudioCtor: class MockAudio {
        constructor(public src: string) {}
        addEventListener = vi.fn();
        play = play;
      } as unknown as typeof Audio,
      createObjectURL: vi.fn().mockReturnValue("blob:question"),
      generateSpeech,
      revokeObjectURL: vi.fn(),
    });

    expect(result).toBe("Used local Kokoro TTS.");
    expect(generateSpeech).toHaveBeenCalledWith("What is your diagnosis?");
    expect(play).toHaveBeenCalledOnce();
  });

  it("falls back to browser speech when Kokoro is unavailable", async () => {
    const speak = vi.fn();

    const result = await speakQuestion("What is your diagnosis?", {
      generateSpeech: vi.fn().mockRejectedValue(new Error("model unavailable")),
      speechSynthesis: { cancel: vi.fn(), speak } as unknown as SpeechSynthesis,
      SpeechSynthesisUtteranceCtor: MockUtterance as unknown as typeof SpeechSynthesisUtterance,
    });

    expect(result).toBe(
      "Local Kokoro TTS unavailable (model unavailable); used browser speech synthesis.",
    );
    expect(speak).toHaveBeenCalledWith(
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
