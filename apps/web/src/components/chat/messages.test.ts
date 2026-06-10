import { describe, expect, it } from "vitest";
import { toRenderItems, type AguiMessage } from "./messages";

const msgs: AguiMessage[] = [
  { id: "u1", role: "user", content: "plan tokyo" },
  // Reasoning arrives as its own message preceding the assistant turn.
  { id: "r1", role: "reasoning", content: "think…" },
  {
    id: "a1",
    role: "assistant",
    content: "Here is a plan",
    toolCalls: [
      { id: "t1", type: "function", function: { name: "write_itinerary", arguments: "{}" } },
    ],
  },
];

describe("toRenderItems", () => {
  it("emits a user item then an assistant item", () => {
    const items = toRenderItems(msgs);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
  });

  it("attaches the preceding reasoning message to the assistant turn", () => {
    const assistant = toRenderItems(msgs)[1];
    if (assistant.kind !== "assistant") throw new Error("expected assistant");
    expect(assistant.text).toBe("Here is a plan");
    expect(assistant.reasoning).toBe("think…");
    expect(assistant.toolCalls.map((t) => t.id)).toEqual(["t1"]);
  });

  it("strips newlines from reasoning text", () => {
    const items = toRenderItems([
      { id: "r1", role: "reasoning", content: "first thought\n\nsecond thought\nthird" },
      { id: "a1", role: "assistant", content: "done" },
    ]);
    const item = items[0];
    if (item.kind !== "assistant") throw new Error("expected assistant");
    expect(item.reasoning).toBe("first thought second thought third");
  });

  it("skips empty assistant turns with no text, tools, or reasoning", () => {
    const items = toRenderItems([{ id: "a0", role: "assistant", content: "" }]);
    expect(items).toEqual([]);
  });

  it("keeps a reasoning-only assistant turn (reasoning but no text/tools)", () => {
    const items = toRenderItems([
      { id: "r1", role: "reasoning", content: "hmm" },
      { id: "a1", role: "assistant", content: "" },
    ]);
    expect(items).toHaveLength(1);
    const item = items[0];
    if (item.kind !== "assistant") throw new Error("expected assistant");
    expect(item.reasoning).toBe("hmm");
  });

  it("renders reasoning as a provisional assistant item while the assistant message hasn't arrived yet", () => {
    const items = toRenderItems([
      { id: "u1", role: "user", content: "think hard" },
      { id: "r1", role: "reasoning", content: "considering options..." },
      // no assistant message yet — still streaming
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    const item = items[1];
    if (item.kind !== "assistant") throw new Error("expected assistant");
    expect(item.id).toBe("r1");
    expect(item.text).toBe("");
    expect(item.reasoning).toBe("considering options...");
  });

  it("passes activity messages through as standalone items carrying the raw message", () => {
    const activity: AguiMessage = { id: "act1", role: "activity", content: "surface" };
    const items = toRenderItems([{ id: "u1", role: "user", content: "hi" }, activity]);
    expect(items.map((i) => i.kind)).toEqual(["user", "activity"]);
    const item = items[1];
    if (item.kind !== "activity") throw new Error("expected activity");
    expect(item.message).toBe(activity);
  });
});
