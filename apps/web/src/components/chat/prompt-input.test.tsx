import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { PromptInput } from "./PromptInput";

const render = (n: ReactElement) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(n);
  });
  return r;
};

describe("PromptInput", () => {
  it("shows a send button when idle and a stop button when running", () => {
    const idle = render(
      <PromptInput value="" onChange={() => {}} onSubmit={() => {}} onStop={() => {}} isRunning={false} placeholder="ask" />,
    );
    expect(JSON.stringify(idle.toJSON())).toContain("Send");

    const running = render(
      <PromptInput value="" onChange={() => {}} onSubmit={() => {}} onStop={() => {}} isRunning placeholder="ask" />,
    );
    expect(JSON.stringify(running.toJSON())).toContain("Stop");
  });

  it("calls onStop when running and the stop button is pressed", () => {
    const onStop = vi.fn();
    const r = render(
      <PromptInput value="" onChange={() => {}} onSubmit={() => {}} onStop={onStop} isRunning placeholder="ask" />,
    );
    const stop = r.root
      .findAll((n) => n.type === "button")
      .find((b) => b.props.onClick === onStop);
    act(() => stop!.props.onClick());
    expect(onStop).toHaveBeenCalledOnce();
  });
});
