import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const setBackgroundColorAsync = vi.fn(async () => undefined);

vi.mock("expo-system-ui", () => ({ setBackgroundColorAsync }));
vi.mock("uniwind", () => ({ useCSSVariable: () => "#123456" }));

describe("useSystemBackgroundColor", () => {
  it("sets the native system background from the CSS variable", async () => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
    });
    const { useSystemBackgroundColor } = await import("./use-system-background-color");

    function Harness() {
      useSystemBackgroundColor();
      return null;
    }

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Harness />);
    });

    expect(setBackgroundColorAsync).toHaveBeenCalledWith("#123456");

    await act(async () => {
      tree!.unmount();
    });
  });
});
