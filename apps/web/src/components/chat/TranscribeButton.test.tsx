import React, { forwardRef, useImperativeHandle } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recorderStart = vi.fn();
const recorderStop = vi.fn();
const setInput = vi.fn();

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAudioRecorder: forwardRef(function CopilotChatAudioRecorder(_, ref) {
    useImperativeHandle(ref, () => ({
      start: recorderStart,
      stop: recorderStop,
    }));
    return null;
  }),
}));

vi.mock("@/components/ai-elements/prompt-input", () => ({
  PromptInputButton: ({
    children,
    tooltip,
    ...props
  }: React.ComponentProps<"button"> & { tooltip?: string }) => (
    <button title={tooltip} type="button" {...props}>
      {children}
    </button>
  ),
  usePromptInputController: () => ({
    textInput: {
      value: "",
      setInput,
    },
  }),
}));

vi.mock("@agents/ui", () => ({
  Button: (props: React.ComponentProps<"button">) => <button type="button" {...props} />,
}));

describe("TranscribeButton", () => {
  beforeEach(() => {
    recorderStart.mockReset();
    recorderStop.mockReset();
    setInput.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  it("cancels an active recording without transcribing it", async () => {
    const { TranscribeButton } = await import("./TranscribeButton");
    recorderStart.mockResolvedValue(undefined);
    recorderStop.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<TranscribeButton />);
    });

    const startButton = () =>
      tree!.root
        .findAllByType("button")
        .find((button) => button.props["aria-label"] === "Start recording");

    await act(async () => {
      await startButton()?.props.onClick();
    });

    const cancelButton = tree!.root
      .findAllByType("button")
      .find((button) => button.props["aria-label"] === "Cancel recording");

    await act(async () => {
      await cancelButton?.props.onClick();
    });

    expect(recorderStop).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(setInput).not.toHaveBeenCalled();
  });
});
