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
};

export async function startResumeIntroductionStream({
  baseUrl,
  token,
}: ResumeIntroductionRequest): Promise<ReadableStream<Uint8Array>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const id = crypto.randomUUID();
  const response = await fetch(`${baseUrl}/agent/resume/suggest`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      threadId: `homepage-${id}`,
      runId: id,
      messages: [{ id: crypto.randomUUID(), role: "user", content: RESUME_INTRODUCTION_PROMPT }],
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok || !response.body) {
    throw new Error("Resume introduction stream unavailable");
  }

  return response.body;
}

export function textFromAguiStream(stream: string): string {
  return textDeltasFromAguiLines(stream.split("\n")).join("").trim();
}

export function textDeltasFromAguiLines(lines: string[]): string[] {
  const deltas: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    try {
      const event: unknown = JSON.parse(line.slice(6));
      if (
        typeof event === "object" &&
        event !== null &&
        "type" in event &&
        event.type === "TEXT_MESSAGE_CONTENT" &&
        "delta" in event &&
        typeof event.delta === "string"
      ) {
        deltas.push(event.delta);
      }
    } catch {
      // Ignore non-JSON SSE metadata and continue collecting text deltas.
    }
  }
  return deltas;
}
