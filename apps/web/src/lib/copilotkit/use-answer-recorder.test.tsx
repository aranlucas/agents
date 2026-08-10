// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAnswerRecorder } from "./use-answer-recorder";

const sentryMocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: sentryMocks.captureException }));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAudioRecorder: () => null,
}));

class MockPermissionStatus extends EventTarget {
  readonly name = "microphone" as PermissionName;
  onchange: ((this: PermissionStatus, event: Event) => unknown) | null = null;

  constructor(public state: PermissionState) {
    super();
  }
}

const getUserMedia = vi.fn<MediaDevices["getUserMedia"]>();
const queryPermission = vi.fn<Permissions["query"]>();

beforeEach(() => {
  getUserMedia.mockReset();
  queryPermission.mockReset();
  sentryMocks.captureException.mockClear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: queryPermission },
  });
});

describe("useAnswerRecorder", () => {
  it("does not start recording until microphone permission is granted", async () => {
    queryPermission.mockResolvedValue(new MockPermissionStatus("prompt"));
    const stopTrack = vi.fn();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream);
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(new Blob(["audio"]));
    const { result } = renderHook(() => useAnswerRecorder(vi.fn()));

    await waitFor(() => expect(result.current.micPermission).toBe("prompt"));
    result.current.recorderRef.current = {
      state: "idle",
      start,
      stop,
      dispose: vi.fn(),
    };

    await act(async () => result.current.toggle());
    expect(start).not.toHaveBeenCalled();

    await act(async () => {
      await expect(result.current.requestPermission()).resolves.toBe(true);
    });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(result.current.micPermission).toBe("granted");

    await act(async () => result.current.toggle());
    expect(start).toHaveBeenCalledOnce();
  });

  it("keeps recording unavailable after microphone permission is denied", async () => {
    queryPermission.mockResolvedValue(new MockPermissionStatus("prompt"));
    getUserMedia.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const { result } = renderHook(() => useAnswerRecorder(vi.fn()));

    await waitFor(() => expect(result.current.micPermission).toBe("prompt"));
    await act(async () => {
      await expect(result.current.requestPermission()).resolves.toBe(false);
    });

    expect(result.current.micPermission).toBe("denied");
    expect(result.current.error).toMatch(/browser settings/i);
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });

  it("records unexpected microphone device failures in Sentry", async () => {
    queryPermission.mockResolvedValue(new MockPermissionStatus("prompt"));
    const deviceError = new DOMException("Microphone is unavailable", "NotReadableError");
    getUserMedia.mockRejectedValue(deviceError);
    const { result } = renderHook(() => useAnswerRecorder(vi.fn()));

    await waitFor(() => expect(result.current.micPermission).toBe("prompt"));
    await act(async () => {
      await expect(result.current.requestPermission()).resolves.toBe(false);
    });

    expect(sentryMocks.captureException).toHaveBeenCalledWith(deviceError, {
      tags: { component: "oralboards_recorder", operation: "microphone.permission" },
    });
  });

  it("records recorder start failures in Sentry", async () => {
    queryPermission.mockResolvedValue(new MockPermissionStatus("granted"));
    const startError = new Error("recorder unavailable");
    const { result } = renderHook(() => useAnswerRecorder(vi.fn()));

    await waitFor(() => expect(result.current.micPermission).toBe("granted"));
    result.current.recorderRef.current = {
      state: "idle",
      start: vi.fn().mockRejectedValue(startError),
      stop: vi.fn(),
      dispose: vi.fn(),
    };
    await act(async () => result.current.toggle());

    expect(sentryMocks.captureException).toHaveBeenCalledWith(startError, {
      tags: { component: "oralboards_recorder", operation: "recording.start" },
    });
  });
});
