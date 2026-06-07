import { describe, expect, it } from "vitest";

import { cssVars } from "./css";
import { cn } from "./utils";

describe("cn", () => {
  it("merges conditional classes and resolves Tailwind conflicts", () => {
    expect(cn("px-2", { hidden: false }, "px-4", ["text-sm"])).toBe("px-4 text-sm");
  });
});

describe("cssVars", () => {
  it("returns style objects with custom properties unchanged", () => {
    const vars = { "--accent": "#fff", opacity: 0.5 };
    expect(cssVars(vars)).toBe(vars);
  });
});
