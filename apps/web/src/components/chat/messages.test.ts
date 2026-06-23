import { describe, expect, it } from "vitest";
import { toRenderItems, type AguiMessage } from "./messages";

const msgs: AguiMessage[] = [
  { id: "u1", role: "user", content: "plan tokyo" },
  // Reasoning arrives as its own message, rendered in place as a standalone block.
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
  it("emits user, reasoning, then assistant items in message order", () => {
    const items = toRenderItems(msgs);
    expect(items.map((i) => i.kind)).toEqual(["user", "reasoning", "assistant"]);
  });

  it("renders reasoning as a standalone block, separate from the assistant turn", () => {
    const items = toRenderItems(msgs);
    const reasoning = items[1];
    const assistant = items[2];
    if (reasoning.kind !== "reasoning") throw new Error("expected reasoning");
    if (assistant.kind !== "assistant") throw new Error("expected assistant");
    expect(reasoning.text).toBe("think…");
    expect(assistant.text).toBe("Here is a plan");
    expect(assistant.toolCalls.map((t) => t.id)).toEqual(["t1"]);
  });

  it("skips empty assistant turns with no text or tools", () => {
    const items = toRenderItems([{ id: "a0", role: "assistant", content: "" }]);
    expect(items).toEqual([]);
  });

  it("skips empty reasoning messages", () => {
    const items = toRenderItems([
      { id: "r1", role: "reasoning", content: "   " },
      { id: "a1", role: "assistant", content: "hi" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant"]);
  });

  it("collapses messages that share an id, merging assistant content and tools", () => {
    // CopilotKit's deduplicateMessages: a snapshot can re-send the same id.
    const items = toRenderItems([
      { id: "a1", role: "assistant", content: "" },
      {
        id: "a1",
        role: "assistant",
        content: "done",
        toolCalls: [{ id: "t1", type: "function", function: { name: "go", arguments: "{}" } }],
      },
    ]);
    expect(items).toHaveLength(1);
    const item = items[0];
    if (item.kind !== "assistant") throw new Error("expected assistant");
    expect(item.text).toBe("done");
    expect(item.toolCalls.map((t) => t.id)).toEqual(["t1"]);
  });

  it("drops a duplicate trailing reasoning message with a different id but identical text", () => {
    // ag-ui-adk re-emits the final aggregated thought as a second reasoning message
    // (new id, same text) ordered after the assistant turn. id-dedup can't catch it.
    const items = toRenderItems([
      { id: "u1", role: "user", content: "say hi" },
      { id: "r1", role: "reasoning", content: "greet warmly" },
      { id: "a1", role: "assistant", content: "Hey there!" },
      { id: "r2", role: "reasoning", content: "greet warmly" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "reasoning", "assistant"]);
    const reasoning = items[1];
    if (reasoning.kind !== "reasoning") throw new Error("expected reasoning");
    expect(reasoning.id).toBe("r1");
    expect(reasoning.text).toBe("greet warmly");
  });

  it("keeps a genuinely new reasoning phase with different text", () => {
    const items = toRenderItems([
      { id: "r1", role: "reasoning", content: "look up trips" },
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "t1", type: "function", function: { name: "list_trips", arguments: "{}" } },
        ],
      },
      { id: "t1", role: "tool", content: "[]", toolCallId: "t1" },
      { id: "r2", role: "reasoning", content: "now summarise" },
      { id: "a2", role: "assistant", content: "Here are your trips" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["reasoning", "assistant", "reasoning", "assistant"]);
  });

  it("does not suppress identical reasoning text across separate turns", () => {
    const items = toRenderItems([
      { id: "r1", role: "reasoning", content: "greet warmly" },
      { id: "a1", role: "assistant", content: "Hi" },
      { id: "u2", role: "user", content: "again" },
      { id: "r2", role: "reasoning", content: "greet warmly" },
      { id: "a2", role: "assistant", content: "Hi again" },
    ]);
    expect(items.map((i) => i.kind)).toEqual([
      "reasoning",
      "assistant",
      "user",
      "reasoning",
      "assistant",
    ]);
  });

  it("renders a reasoning-only turn while the assistant message is still streaming", () => {
    const items = toRenderItems([
      { id: "u1", role: "user", content: "think hard" },
      { id: "r1", role: "reasoning", content: "considering options..." },
      // no assistant message yet — still streaming
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "reasoning"]);
    const item = items[1];
    if (item.kind !== "reasoning") throw new Error("expected reasoning");
    expect(item.id).toBe("r1");
    expect(item.text).toBe("considering options...");
  });

  it("passes activity messages through as standalone items carrying the raw message", () => {
    const activity: AguiMessage = { id: "act1", role: "activity", content: "surface" };
    const items = toRenderItems([{ id: "u1", role: "user", content: "hi" }, activity]);
    expect(items.map((i) => i.kind)).toEqual(["user", "activity"]);
    const item = items[1];
    if (item.kind !== "activity") throw new Error("expected activity");
    expect(item.message).toBe(activity);
  });

  it("preserves A2UI activity metadata for the custom chat renderer", () => {
    const message: AguiMessage = {
      id: "surface-1",
      role: "activity",
      activityType: "a2ui-surface",
      content: {
        status: "painted",
        a2ui_operations: [{ createSurface: { surfaceId: "trends-result" } }],
      },
    };

    expect(toRenderItems([message])).toEqual([{ kind: "activity", id: "surface-1", message }]);
  });
});
