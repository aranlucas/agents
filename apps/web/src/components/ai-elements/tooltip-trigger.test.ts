import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

describe("AI element tooltip triggers", () => {
  it("renders action buttons as the tooltip trigger element", () => {
    expect(source("./artifact.tsx")).not.toContain("<TooltipTrigger>{button}</TooltipTrigger>");
    expect(source("./message.tsx")).not.toContain("<TooltipTrigger>{button}</TooltipTrigger>");
  });
});
