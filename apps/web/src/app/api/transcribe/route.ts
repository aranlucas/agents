export const maxDuration = 60;

import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";
import { GroqTranscriptionService } from "@/lib/copilotkit/groq-transcription";

export async function POST(request: Request): Promise<Response> {
  await auth.protect();
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "An audio file is required." }, { status: 400 });
  }

  try {
    const service = new GroqTranscriptionService(env.GROQ_API_KEY ?? "");
    return Response.json({ text: await service.transcribeFile(audio) });
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        component: "oralboards_transcription",
        operation: "audio.transcribe",
        provider: "groq",
      },
      extra: {
        audio_size: audio.size,
        audio_type: audio.type || "unknown",
      },
    });
    // This is already an explicit Sentry event with provider metadata; logging it
    // as an error would make CaptureConsole send a duplicate event.
    console.warn("Transcription failed", error);
    return Response.json({ error: "Transcription failed." }, { status: 502 });
  }
}
