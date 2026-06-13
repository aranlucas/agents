import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { SpeakQuestionToolCall } from "./SpeakQuestionToolCall";

describe("SpeakQuestionToolCall", () => {
  it("renders while tool arguments are still unavailable", () => {
    expect(() => {
      create(
        <SpeakQuestionToolCall status="inProgress" parameters={undefined} result={undefined} />,
      );
    }).not.toThrow();
  });
});
