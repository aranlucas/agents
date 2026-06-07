import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { Message } from "./Message";

function render(node: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(node);
  });
  return r;
}

describe("Message", () => {
  it("renders a user bubble with the text", () => {
    const r = render(<Message role="user" text="hello" />);
    expect(JSON.stringify(r.toJSON())).toContain("hello");
  });

  it("renders an assistant reasoning summary when reasoning is present", () => {
    const r = render(<Message role="assistant" text="hi" reasoning="because" />);
    expect(JSON.stringify(r.toJSON())).toContain("Thought");
  });

  it("omits the reasoning block when absent", () => {
    const r = render(<Message role="assistant" text="hi" />);
    expect(JSON.stringify(r.toJSON())).not.toContain("Thought");
  });
});
