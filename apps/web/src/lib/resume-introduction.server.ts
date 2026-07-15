import { auth } from "@clerk/nextjs/server";

import { env } from "@/env";
import { startResumeIntroductionStream } from "@/lib/resume-introduction";

export async function loadResumeIntroductionStream() {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    return await startResumeIntroductionStream({
      baseUrl: env.AGENTS_BASE_URL,
      token,
    });
  } catch {
    return null;
  }
}
