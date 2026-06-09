// Mirrors the @ag-ui/core message shapes we consume. Assistant carries optional
// toolCalls; reasoning arrives as its own `role: "reasoning"` message preceding
// the assistant turn it belongs to.
export type AguiToolCall = {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
};

export type AguiMessage = {
  id: string;
  role: "user" | "assistant" | "reasoning" | "system" | "tool" | "activity" | string;
  content?: string;
  toolCalls?: AguiToolCall[];
  /** Present on `role: "tool"` result messages — links the result to its call. */
  toolCallId?: string;
};

export type RenderItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      reasoning?: string;
      toolCalls: AguiToolCall[];
    }
  // Activity messages (e.g. A2UI surfaces) are rendered standalone via the
  // `useRenderActivityMessage` resolver; we carry the raw message through.
  | { kind: "activity"; id: string; message: AguiMessage };

export function toRenderItems(messages: AguiMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  let pendingReasoning: string | undefined;

  for (const m of messages) {
    if (m.role === "reasoning") {
      const text = (m.content ?? "").trim();
      if (text) pendingReasoning = text;
      continue;
    }
    if (m.role === "activity") {
      items.push({ kind: "activity", id: m.id, message: m });
      continue;
    }
    if (m.role === "user") {
      const text = (m.content ?? "").trim();
      if (text) items.push({ kind: "user", id: m.id, text });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content ?? "";
      const toolCalls = m.toolCalls ?? [];
      const reasoning = pendingReasoning;
      pendingReasoning = undefined;
      if (!text.trim() && toolCalls.length === 0 && !reasoning) continue;
      items.push({ kind: "assistant", id: m.id, text, reasoning, toolCalls });
    }
  }
  return items;
}
