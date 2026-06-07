import { describe, expect, it } from "vitest";
import { shouldPinToBottom } from "./scroll";

describe("shouldPinToBottom", () => {
  it("pins when the viewport is at/near the bottom", () => {
    expect(shouldPinToBottom({ scrollTop: 880, clientHeight: 120, scrollHeight: 1000 })).toBe(true);
  });

  it("does not pin when the user has scrolled up beyond the threshold", () => {
    expect(shouldPinToBottom({ scrollTop: 200, clientHeight: 120, scrollHeight: 1000 })).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(
      shouldPinToBottom({ scrollTop: 800, clientHeight: 120, scrollHeight: 1000, threshold: 100 }),
    ).toBe(true);
  });
});
