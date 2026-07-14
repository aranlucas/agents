export const maxDuration = 60;

import { env } from "@/env";
import { GroqTranscriptionService } from "@/lib/copilotkit/groq-transcription";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "An audio file is required." }, { status: 400 });
  }

  try {
    const service = new GroqTranscriptionService(env.GROQ_API_KEY ?? "");
    return Response.json({ text: await service.transcribeFile(audio) });
  } catch (error) {
    console.error("Transcription failed", error);
    return Response.json({ error: "Transcription failed." }, { status: 502 });
  }
}
