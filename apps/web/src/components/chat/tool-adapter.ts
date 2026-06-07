// Maps CopilotKit tool-call status (camelCase) to the ai-elements `Tool`
// component's `state` union (a subset of the Vercel AI SDK ToolUIPart states).
// Kept as a literal union so the unit test stays pure; ChatSurface asserts
// compatibility structurally when it passes the result to <ToolHeader />.
export type AiToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type CopilotToolStatus = "inProgress" | "executing" | "complete";

export function toToolState(status: CopilotToolStatus, hasError = false): AiToolState {
  if (status === "complete") return hasError ? "output-error" : "output-available";
  if (status === "executing") return "input-available";
  return "input-streaming";
}
