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

  it("does not render reasoning twice when a duplicate reasoning message trails the assistant turn", () => {
    // The stream can leave a reasoning message ordered after the assistant text
    // message it belongs to. It must not produce a second "Thinking" block.
    const items = toRenderItems([
      { id: "u1", role: "user", content: "say hi" },
      { id: "r1", role: "reasoning", content: "greet warmly" },
      { id: "a1", role: "assistant", content: "Hey there!" },
      { id: "r2", role: "reasoning", content: "greet warmly" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
    const item = items[1];
    if (item.kind !== "assistant") throw new Error("expected assistant");
    expect(item.text).toBe("Hey there!");
    expect(item.reasoning).toBe("greet warmly");
  });

  it("attaches trailing reasoning to a preceding assistant turn that has none", () => {
    const items = toRenderItems([
      { id: "a1", role: "assistant", content: "Hey there!" },
      { id: "r1", role: "reasoning", content: "greet warmly" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant"]);
    const item = items[0];
    if (item.kind !== "assistant") throw new Error("expected assistant");
    expect(item.text).toBe("Hey there!");
    expect(item.reasoning).toBe("greet warmly");
  });

  it("shows a new trailing reasoning phase after a tool-call turn as a provisional item", () => {
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
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant", "assistant"]);
    const first = items[0];
    const second = items[1];
    if (first.kind !== "assistant" || second.kind !== "assistant") {
      throw new Error("expected assistants");
    }
    expect(first.reasoning).toBe("look up trips");
    expect(second.text).toBe("");
    expect(second.reasoning).toBe("now summarise");
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
