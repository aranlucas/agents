// Mirrors the @ag-ui/core message shapes we consume. Assistant carries optional
// toolCalls; reasoning arrives as its own `role: "reasoning"` message rendered
// in place (a standalone "Thinking" block), the same way CopilotKit's
// CopilotChatMessageView renders reasoning messages.
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
  | { kind: "assistant"; id: string; text: string; toolCalls: AguiToolCall[] }
  // Reasoning renders as its own standalone block in message order.
  | { kind: "reasoning"; id: string; text: string }
  // Activity messages (e.g. A2UI surfaces) are rendered standalone via the
  // `useRenderActivityMessage` resolver; we carry the raw message through.
  | { kind: "activity"; id: string; message: AguiMessage };

// Mirrors CopilotKit's `deduplicateMessages`: collapse messages that share an id,
// merging two assistant messages so streamed content/toolCalls aren't lost when a
// snapshot re-sends the same id.
function dedupeById(messages: AguiMessage[]): AguiMessage[] {
  const acc = new Map<string, AguiMessage>();
  for (const m of messages) {
    const existing = acc.get(m.id);
    if (existing && m.role === "assistant" && existing.role === "assistant") {
      acc.set(m.id, {
        ...existing,
        ...m,
        content: m.content || existing.content,
        toolCalls: m.toolCalls ?? existing.toolCalls,
      });
    } else {
      acc.set(m.id, m);
    }
  }
  return [...acc.values()];
}

export function toRenderItems(messages: AguiMessage[]): RenderItem[] {
  const items: RenderItem[] = [];
  // Tracks the previous reasoning text within the current turn. ag-ui-adk re-emits
  // the final aggregated thought as a *second* reasoning message with a different
  // id (its own dedup guard misses it once the reasoning stream has been closed by
  // the text transition), so id-based dedup alone cannot collapse it. Drop a
  // reasoning message whose text repeats the previous one in the same turn.
  let lastReasoningText: string | undefined;

  for (const m of dedupeById(messages)) {
    if (m.role === "reasoning") {
      const text = (m.content ?? "").trim();
      if (!text || text === lastReasoningText) continue;
      lastReasoningText = text;
      items.push({ kind: "reasoning", id: m.id, text });
      continue;
    }
    if (m.role === "activity") {
      items.push({ kind: "activity", id: m.id, message: m });
      continue;
    }
    if (m.role === "user") {
      // A user message starts a new turn — reasoning from a prior turn should not
      // suppress identical reasoning text later.
      lastReasoningText = undefined;
      const text = (m.content ?? "").trim();
      if (text) items.push({ kind: "user", id: m.id, text });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content ?? "";
      const toolCalls = m.toolCalls ?? [];
      if (!text.trim() && toolCalls.length === 0) continue;
      items.push({ kind: "assistant", id: m.id, text, toolCalls });
    }
  }

  return items;
}
