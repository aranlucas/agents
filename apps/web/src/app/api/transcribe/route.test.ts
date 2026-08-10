import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  protect: vi.fn(),
  captureException: vi.fn(),
  transcribeFile: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: Object.assign(vi.fn(), { protect: mocks.protect }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));

vi.mock("@/env", () => ({ env: { GROQ_API_KEY: "test-key" } }));

vi.mock("@/lib/copilotkit/groq-transcription", () => ({
  GroqTranscriptionService: class MockGroqTranscriptionService {
    transcribeFile = mocks.transcribeFile;
  },
}));

import { POST } from "./route";

function transcriptionRequest() {
  const form = new FormData();
  form.append("audio", new File(["audio"], "answer.webm", { type: "audio/webm" }));
  return { formData: async () => form } as Request;
}

describe("POST /api/transcribe", () => {
  beforeEach(() => {
    mocks.protect.mockReset().mockResolvedValue(undefined);
    mocks.captureException.mockClear();
    mocks.transcribeFile.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a transcript without reporting an error", async () => {
    mocks.transcribeFile.mockResolvedValue("Irreversible pulpitis");

    const response = await POST(transcriptionRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: "Irreversible pulpitis" });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("records provider failures in Sentry with safe audio metadata", async () => {
    const providerError = new Error("Groq rate limited");
    mocks.transcribeFile.mockRejectedValue(providerError);

    const response = await POST(transcriptionRequest());

    expect(response.status).toBe(502);
    expect(mocks.captureException).toHaveBeenCalledWith(providerError, {
      tags: {
        component: "oralboards_transcription",
        operation: "audio.transcribe",
        provider: "groq",
      },
      extra: { audio_size: 5, audio_type: "audio/webm" },
    });
  });
});
