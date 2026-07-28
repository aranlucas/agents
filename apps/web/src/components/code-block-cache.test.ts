import { describe, expect, it, vi } from "vitest";
import { highlightCode } from "@agents/ui/components/ai-elements/code-block";

type HighlightResult = Exclude<ReturnType<typeof highlightCode>, null>;

const tokenizedSource = (result: HighlightResult) =>
  result.tokens.map((line) => line.map((token) => token.content).join("")).join("\n");

describe("highlightCode", () => {
  it("does not reuse tokens for sources with matching length, prefix, and suffix", async () => {
    const prefix = "const sharedPrefix = true;\n".padEnd(100, " ");
    const suffix = "\nexport { sharedSuffix };".padStart(100, " ");
    const firstCode = `${prefix}const middle = "first";${suffix}`;
    const secondCode = `${prefix}const middle = "other";${suffix}`;
    expect(firstCode).not.toBe(secondCode);
    expect(firstCode).toHaveLength(secondCode.length);
    expect(firstCode.slice(0, 100)).toBe(secondCode.slice(0, 100));
    expect(firstCode.slice(-100)).toBe(secondCode.slice(-100));

    const firstCallback = vi.fn<(result: HighlightResult) => void>();
    expect(highlightCode(firstCode, "typescript", firstCallback)).toBeNull();
    await vi.waitFor(() => expect(firstCallback).toHaveBeenCalledOnce());
    expect(tokenizedSource(firstCallback.mock.calls[0]?.[0])).toBe(firstCode);

    const secondCallback = vi.fn<(result: HighlightResult) => void>();
    expect(highlightCode(secondCode, "typescript", secondCallback)).toBeNull();
    await vi.waitFor(() => expect(secondCallback).toHaveBeenCalledOnce());
    expect(tokenizedSource(secondCallback.mock.calls[0]?.[0])).toBe(secondCode);
  });
});
