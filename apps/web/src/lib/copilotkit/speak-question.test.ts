import { describe, expect, it, vi } from "vitest";

import { preloadKokoro, speakQuestion } from "./speak-question";

class MockUtterance {
  constructor(public text: string) {}
}

describe("speakQuestion", () => {
  it("uses local Kokoro TTS by default", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockResolvedValue({
      toBlob: () => new Blob(["audio"], { type: "audio/wav" }),
    });
    const fromPretrained = vi.fn().mockResolvedValue({ generate });
    const importKokoro = vi.fn().mockResolvedValue({
      KokoroTTS: { from_pretrained: fromPretrained },
    });

    const result = await speakQuestion("What is your diagnosis?", {
      AudioCtor: class MockAudio {
        constructor(public src: string) {}
        addEventListener = vi.fn();
        play = play;
      } as unknown as typeof Audio,
      createObjectURL: vi.fn().mockReturnValue("blob:question"),
      importKokoro,
      revokeObjectURL: vi.fn(),
    });

    expect(result).toBe("Used local Kokoro TTS.");
    expect(importKokoro).toHaveBeenCalledOnce();
    expect(fromPretrained).toHaveBeenCalledWith("onnx-community/Kokoro-82M-ONNX", {
      dtype: "q8",
      device: "wasm",
    });
    expect(generate).toHaveBeenCalledWith("What is your diagnosis?", { voice: "af_sky" });
    expect(play).toHaveBeenCalledOnce();
  });

  it("falls back to browser speech when Kokoro is unavailable", async () => {
    const speak = vi.fn();

    const result = await speakQuestion("What is your diagnosis?", {
      importKokoro: vi.fn().mockRejectedValue(new Error("model unavailable")),
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
      importKokoro: vi.fn().mockRejectedValue(new Error("model unavailable")),
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
    const fromPretrained = vi.fn().mockResolvedValue({ generate: vi.fn() });
    const importKokoro = vi.fn().mockResolvedValue({
      KokoroTTS: { from_pretrained: fromPretrained },
    });

    const ok = await preloadKokoro({ importKokoro });

    expect(ok).toBe(true);
    expect(fromPretrained).toHaveBeenCalledWith("onnx-community/Kokoro-82M-ONNX", {
      dtype: "q8",
      device: "wasm",
    });
  });

  it("swallows load failures and reports false", async () => {
    const ok = await preloadKokoro({
      importKokoro: vi.fn().mockRejectedValue(new Error("model unavailable")),
    });

    expect(ok).toBe(false);
  });
});
