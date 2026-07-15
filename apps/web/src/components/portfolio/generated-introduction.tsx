import { Suspense } from "react";

import { IntroductionSkeleton, StreamingIntroduction } from "./streaming-introduction";
import { loadResumeIntroductionStream } from "@/lib/resume-snapshot.server";

export { IntroductionSkeleton } from "./streaming-introduction";

export async function GeneratedIntroduction() {
  const stream = loadResumeIntroductionStream();
  return (
    <Suspense fallback={<IntroductionSkeleton />}>
      <StreamingIntroduction stream={stream} />
    </Suspense>
  );
}
