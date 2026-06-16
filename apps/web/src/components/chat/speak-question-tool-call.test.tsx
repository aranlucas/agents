import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpeakQuestionToolCall } from "./speak-question-tool-call";

describe("SpeakQuestionToolCall", () => {
  it("renders while tool arguments are still unavailable", () => {
    expect(() => {
      render(
        <SpeakQuestionToolCall status="inProgress" parameters={undefined} result={undefined} />,
      );
    }).not.toThrow();
  });
});
