import { describe, expect, it, vi } from "vitest";

import { preloadKokoro, speak, speakQuestion, stopSpeaking } from "./speak-question";

class MockUtterance {
  rate?: number;
  constructor(public text: string) {}
}

class MockAudio {
  constructor(public src: string) {}
  addEventListener = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

describe("speakQuestion", () => {
  it("uses local Kokoro TTS by default", async () => {
    const generateSpeech = vi.fn().mockResolvedValue({
      data: new ArrayBuffer(8),
      sampleRate: 24000,
    });
    const AudioCtor = class extends MockAudio {} as unknown as typeof Audio;

    const result = await speakQuestion("What is your diagnosis?", {
      AudioCtor,
      createObjectURL: vi.fn().mockReturnValue("blob:question"),
      generateSpeech,
      revokeObjectURL: vi.fn(),
    });

    expect(result).toBe("Used local Kokoro TTS.");
    // speakQuestion wrapper passes speed: 1 explicitly
    expect(generateSpeech).toHaveBeenCalledWith("What is your diagnosis?", 1);
  });

  it("passes speed through to generateSpeech", async () => {
    const generateSpeech = vi.fn().mockResolvedValue({
      data: new ArrayBuffer(8),
      sampleRate: 24000,
    });
    const AudioCtor = class extends MockAudio {} as unknown as typeof Audio;

    await speak("Read slowly.", {
      speed: 0.8,
      generateSpeech,
      AudioCtor,
      createObjectURL: vi.fn().mockReturnValue("blob:slow"),
      revokeObjectURL: vi.fn(),
    });

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

  it("stopSpeaking pauses the active player", async () => {
    // Reset any leftover active player first
    stopSpeaking();

    const pauseSpy = vi.fn();
    const cancelSpy = vi.fn();
    const AudioCtor = class {
      constructor(public src: string) {}
      addEventListener = vi.fn((_event: string, _cb: () => void) => {
        // Don't auto-fire ended so the player stays active
      });
      play = vi.fn().mockResolvedValue(undefined);
      pause = pauseSpy;
    } as unknown as typeof Audio;

    const generateSpeech = vi.fn().mockResolvedValue({
      data: new ArrayBuffer(8),
      sampleRate: 24000,
    });

    // Start speaking (don't await the full "ended" event — just let play resolve)
    await speak("Test stop.", {
      generateSpeech,
      AudioCtor,
      createObjectURL: vi.fn().mockReturnValue("blob:stop"),
      revokeObjectURL: vi.fn(),
    });

    // Now stop it
    stopSpeaking({ speechSynthesis: { cancel: cancelSpy } as unknown as SpeechSynthesis });

    expect(pauseSpy).toHaveBeenCalledOnce();
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
