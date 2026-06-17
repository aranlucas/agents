import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { type Ref, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recorderStart = vi.fn();
const recorderStop = vi.fn();
const setInput = vi.fn();
const user = userEvent.setup();

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAudioRecorder: function CopilotChatAudioRecorder({
    ref,
  }: {
    ref?: Ref<{ start: () => Promise<void>; stop: () => Promise<Blob> }>;
  }) {
    useImperativeHandle(ref, () => ({
      start: recorderStart,
      stop: recorderStop,
    }));
    return null;
  },
}));

vi.mock("@agents/ui/components/ai-elements/prompt-input", () => ({
  PromptInputButton: ({
    children,
    tooltip,
    ...props
  }: ComponentProps<"button"> & { tooltip?: string }) => (
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
  Button: (props: ComponentProps<"button">) => <button type="button" {...props} />,
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
    const { TranscribeButton } = await import("./transcribe-button");
    recorderStart.mockResolvedValue(undefined);
    recorderStop.mockResolvedValue(new Blob(["audio"], { type: "audio/webm" }));

    render(<TranscribeButton />);

    await user.click(screen.getByRole("button", { name: /start recording/i }));
    await user.click(screen.getByRole("button", { name: /cancel recording/i }));

    expect(recorderStop).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(setInput).not.toHaveBeenCalled();
  });
});
