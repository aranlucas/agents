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
  let pendingReasoning: { id: string; text: string } | undefined;

  for (const m of messages) {
    if (m.role === "reasoning") {
      const text = (m.content ?? "").trim();
      if (text) pendingReasoning = { id: m.id, text };
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
      const reasoning = pendingReasoning?.text;
      pendingReasoning = undefined;
      if (!text.trim() && toolCalls.length === 0 && !reasoning) continue;
      items.push({ kind: "assistant", id: m.id, text, reasoning, toolCalls });
    }
  }

  // Trailing reasoning with no assistant message after it. The stream can leave a
  // reasoning message ordered *after* the assistant turn it belongs to, so reconcile
  // it with the previous item instead of always emitting a standalone block.
  if (pendingReasoning) {
    const last = items[items.length - 1];
    if (last?.kind === "assistant") {
      // The reasoning belongs to this turn. Attach it if the turn has none yet;
      // skip it if the same reasoning is already shown (the duplicate that would
      // otherwise render a second "Thinking" block below the response).
      if (!last.reasoning) {
        last.reasoning = pendingReasoning.text;
      } else if (last.reasoning !== pendingReasoning.text) {
        // A genuinely new reasoning phase (e.g. after a tool call) whose assistant
        // response hasn't started yet — show it provisionally while streaming.
        items.push({
          kind: "assistant",
          id: pendingReasoning.id,
          text: "",
          reasoning: pendingReasoning.text,
          toolCalls: [],
        });
      }
    } else {
      // No assistant turn yet (still streaming the first reasoning). Emit a
      // provisional item so the reasoning text is visible immediately.
      items.push({
        kind: "assistant",
        id: pendingReasoning.id,
        text: "",
        reasoning: pendingReasoning.text,
        toolCalls: [],
      });
    }
  }

  return items;
}
