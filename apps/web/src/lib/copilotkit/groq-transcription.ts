import Groq from "groq-sdk";

export class GroqTranscriptionService {
  private client: Groq;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey });
  }

  async transcribeFile(audioFile: File): Promise<string> {
    const result = await this.client.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
    });
    return result.text;
  }
}
