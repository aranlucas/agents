// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpeechInput } from "./speech-input";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  if (!resolve) {
    throw new Error("Failed to initialize deferred promise");
  }
  return { promise, resolve };
}

function createStream() {
  const stop = vi.fn();
  return {
    stop,
    stream: {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream,
  };
}

class MockMediaRecorder extends EventTarget {
  static instances: MockMediaRecorder[] = [];

  readonly start = vi.fn(() => {
    this.state = "recording";
  });

  readonly stop = vi.fn(() => {
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  });

  state: RecordingState = "inactive";

  constructor(readonly stream: MediaStream) {
    super();
    MockMediaRecorder.instances.push(this);
  }
}

type RenderedSpeechInput = {
  button: HTMLButtonElement;
  unmount: () => void;
};

const mountedRoots = new Set<Root>();
const getUserMediaMock = vi.fn<MediaDevices["getUserMedia"]>();

function renderSpeechInput({
  disabled,
}: {
  disabled?: boolean;
} = {}): RenderedSpeechInput {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.add(root);

  act(() => {
    root.render(
      <SpeechInput disabled={disabled} onAudioRecorded={vi.fn().mockResolvedValue("")} />,
    );
  });

  const button = container.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("SpeechInput did not render a button");
  }

  return {
    button,
    unmount: () => {
      if (!mountedRoots.delete(root)) return;
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  MockMediaRecorder.instances = [];
  getUserMediaMock.mockReset();
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: getUserMediaMock,
    },
  });
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of mountedRoots) {
    act(() => root.unmount());
  }
  mountedRoots.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SpeechInput MediaRecorder lifecycle", () => {
  it("stops a stream that resolves after unmount without creating a recorder", async () => {
    const request = deferred<MediaStream>();
    getUserMediaMock.mockReturnValue(request.promise);
    const { button, unmount } = renderSpeechInput();

    act(() => button.click());
    expect(button.getAttribute("aria-label")).toBe("Requesting microphone access");
    expect(button.getAttribute("aria-busy")).toBe("true");

    unmount();
    const { stream, stop } = createStream();
    await act(async () => {
      request.resolve(stream);
      await request.promise;
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(MockMediaRecorder.instances).toHaveLength(0);
  });

  it("allows only one pending microphone request", async () => {
    const request = deferred<MediaStream>();
    getUserMediaMock.mockReturnValue(request.promise);
    const { button } = renderSpeechInput({ disabled: false });

    act(() => {
      button.click();
      button.click();
    });

    expect(getUserMediaMock).toHaveBeenCalledOnce();

    const { stream } = createStream();
    await act(async () => {
      request.resolve(stream);
      await request.promise;
    });

    expect(MockMediaRecorder.instances).toHaveLength(1);
    expect(MockMediaRecorder.instances[0]?.start).toHaveBeenCalledOnce();
  });

  it("provides state-aware accessible labels and busy state", async () => {
    const request = deferred<MediaStream>();
    getUserMediaMock.mockReturnValue(request.promise);
    const { button } = renderSpeechInput();

    expect(button.getAttribute("aria-label")).toBe("Start voice input");
    expect(button.getAttribute("aria-busy")).toBe("false");

    act(() => button.click());
    expect(button.getAttribute("aria-label")).toBe("Requesting microphone access");
    expect(button.getAttribute("aria-busy")).toBe("true");

    const { stream } = createStream();
    await act(async () => {
      request.resolve(stream);
      await request.promise;
    });

    expect(button.getAttribute("aria-label")).toBe("Stop recording");
    expect(button.getAttribute("aria-busy")).toBe("false");
  });
});
