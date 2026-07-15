import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

import { env } from "@/env";
import { fetchAgentSnapshot } from "@/lib/agent-snapshot";
import { startResumeIntroductionStream } from "@/lib/resume-introduction";

export const getResumeToken = cache(async (): Promise<string | null> => {
  const { getToken } = await auth();
  return getToken();
});

export async function loadResumeSnapshot(threadId: string) {
  try {
    const token = await getResumeToken();
    return fetchAgentSnapshot({
      baseUrl: env.AGENTS_BASE_URL,
      agentId: "resume",
      threadId,
      token,
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    return null;
  }
}

export async function loadResumeIntroductionStream() {
  try {
    const token = await getResumeToken();
    return await startResumeIntroductionStream({
      baseUrl: env.AGENTS_BASE_URL,
      token,
    });
  } catch {
    return null;
  }
}
