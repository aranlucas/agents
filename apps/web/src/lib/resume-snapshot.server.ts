import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

import { env } from "@/env";
import { startResumeIntroductionStream } from "@/lib/resume-introduction";

export const getResumeToken = cache(async (): Promise<string | null> => {
  const { getToken } = await auth();
  return getToken();
});

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
