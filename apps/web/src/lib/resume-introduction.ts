import { HttpAgent, type HttpAgentFetchFn } from "@ag-ui/client";

import { agentBaseUrl } from "@/lib/agent-url";

export const RESUME_INTRODUCTION_PROMPT = `Write a first-person About introduction for Lucas Arango's personal website.
Use only facts from your embedded source resume. Write with a quiet, personal, editorial voice:
direct, warm, specific, and conversational. It should sound like a person explaining what he does
and cares about, not a resume summary or marketing copy.

In the first paragraph, share Lucas's engineering background: more than 10 years building and
shipping products at DoorDash, Amazon, and AWS, with an emphasis on taking ideas from prototype to
launch and on his work with conversational AI and agents. Do not list titles, dates, or credentials.

In the second paragraph, connect that work to his interests. Include his habit of building personal
agents, his interest in learning and creative problem-solving, and grounded details about life
outside work such as travel, camping and climbing in the Cascades, running, or lifting.

Write two short paragraphs and 90 to 120 words total. Do not use a heading, bullets, a call to action,
hype, clichés, or language copied from another person's website.`;

type ResumeIntroductionRequest = {
  baseUrl: string;
  token: string | null;
  abortController: AbortController;
  onDelta?: (delta: string, text: string) => void;
  fetch?: HttpAgentFetchFn;
};

/**
 * Runs the public Resume suggestion endpoint through the official AG-UI client.
 * HttpAgent owns the POST transport, SSE decoding, event validation, and run
 * lifecycle; this adapter only selects text deltas for the portfolio prose.
 */
export async function runResumeIntroduction({
  baseUrl,
  token,
  abortController,
  onDelta,
  fetch,
}: ResumeIntroductionRequest): Promise<string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const id = crypto.randomUUID();
  const agent = new HttpAgent({
    agentId: "resume",
    url: `${agentBaseUrl(baseUrl)}/agent/resume/suggest`,
    headers,
    threadId: `homepage-${id}`,
    initialMessages: [
      { id: crypto.randomUUID(), role: "user", content: RESUME_INTRODUCTION_PROMPT },
    ],
    initialState: {},
    ...(fetch ? { fetch } : {}),
  });

  let text = "";
  let runError: Error | undefined;
  await agent.runAgent(
    {
      runId: id,
      tools: [],
      context: [],
      forwardedProps: {},
      abortController,
    },
    {
      onTextMessageContentEvent({ event }) {
        text += event.delta;
        onDelta?.(event.delta, text);
      },
      onRunErrorEvent({ event }) {
        runError = new Error(event.message);
      },
    },
  );

  if (abortController.signal.aborted) {
    throw new DOMException("Resume introduction request aborted", "AbortError");
  }
  if (runError) throw runError;

  const introduction = text.trim();
  if (!introduction) throw new Error("Resume introduction was empty");
  return introduction;
}
