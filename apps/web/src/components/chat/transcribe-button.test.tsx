import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Ref, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";
import type { PromptInputControllerProps } from "@agents/ui";

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

vi.mock("@agents/ui", () => import("@/__mocks__/@agents/ui"));

import { usePromptInputController } from "@agents/ui";

describe("TranscribeButton", () => {
  beforeEach(() => {
    recorderStart.mockReset();
    recorderStop.mockReset();
    setInput.mockReset();
    vi.mocked(usePromptInputController).mockReset();
    vi.mocked(usePromptInputController).mockReturnValue({
      textInput: { value: "", setInput, clear: vi.fn() },
    } as unknown as PromptInputControllerProps);
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
