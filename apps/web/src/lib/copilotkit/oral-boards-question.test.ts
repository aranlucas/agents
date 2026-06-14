import { describe, expect, it, vi } from "vitest";

import {
  clearCurrentQuestion,
  getCurrentQuestion,
  setCurrentQuestion,
  subscribeCurrentQuestion,
} from "./oral-boards-question";

describe("oral-boards question store", () => {
  it("stores and returns the current question", () => {
    setCurrentQuestion("What is your management?");
    expect(getCurrentQuestion()).toBe("What is your management?");
  });

  it("notifies subscribers on change and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCurrentQuestion(listener);
    setCurrentQuestion("Q1");
    clearCurrentQuestion();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setCurrentQuestion("Q2");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
