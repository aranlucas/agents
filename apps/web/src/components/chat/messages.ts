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
  role: string;
  content?: unknown;
  activityType?: string;
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
      const existingText = typeof existing.content === "string" ? existing.content : "";
      const incomingText = typeof m.content === "string" ? m.content : "";
      acc.set(m.id, {
        ...existing,
        ...m,
        content: incomingText || existingText,
        toolCalls: m.toolCalls ?? existing.toolCalls,
      });
    } else {
      acc.set(m.id, m);
    }
  }
  return [...acc.values()];
}

function isTextPart(p: unknown): p is { type: "text"; text: string } {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as Record<string, unknown>;
  return obj.type === "text" && typeof obj.text === "string";
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(isTextPart)
    .map((p) => p.text)
    .join("");
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
    const text = extractText(m.content);
    if (m.role === "reasoning") {
      const trimmed = text.trim();
      if (!trimmed || trimmed === lastReasoningText) continue;
      lastReasoningText = trimmed;
      items.push({ kind: "reasoning", id: m.id, text: trimmed });
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
      const trimmed = text.trim();
      if (trimmed) items.push({ kind: "user", id: m.id, text: trimmed });
      continue;
    }
    if (m.role === "assistant") {
      const toolCalls = m.toolCalls ?? [];
      if (!text.trim() && toolCalls.length === 0) continue;
      items.push({ kind: "assistant", id: m.id, text, toolCalls });
    }
  }

  return items;
}
