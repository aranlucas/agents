import Groq from "groq-sdk";
import { TranscriptionService, type TranscribeFileOptions } from "@copilotkit/runtime/v2";

export class GroqTranscriptionService extends TranscriptionService {
  private client: Groq;

  constructor(apiKey: string) {
    super();
    this.client = new Groq({ apiKey });
  }

  async transcribeFile({ audioFile }: TranscribeFileOptions): Promise<string> {
    const result = await this.client.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
    });
    return result.text;
  }
}
