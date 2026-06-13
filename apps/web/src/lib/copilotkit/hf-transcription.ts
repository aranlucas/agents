import { InferenceClient } from "@huggingface/inference";
import { TranscriptionService, type TranscribeFileOptions } from "@copilotkit/runtime/v2";

export class HFTranscriptionService extends TranscriptionService {
  private client: InferenceClient;

  constructor(
    apiKey: string,
    private model = "openai/whisper-large-v3",
  ) {
    super();
    console.log(
      "[HFTranscriptionService] initializing with model:",
      model,
      "apiKey present:",
      !!apiKey,
    );
    this.client = new InferenceClient(apiKey);
  }

  async transcribeFile(options: TranscribeFileOptions): Promise<string> {
    const { audioFile } = options;

    console.log("[HFTranscriptionService] audioFile type:", audioFile.type);
    console.log("[HFTranscriptionService] audioFile size:", audioFile.size);
    console.log("[HFTranscriptionService] audioFile constructor:", audioFile.constructor.name);

    try {
      console.log(
        "[HFTranscriptionService] calling automaticSpeechRecognition with model:",
        this.model,
        "provider: hf-inference",
      );

      const result = await this.client.automaticSpeechRecognition({
        model: this.model,
        data: audioFile,
        provider: "hf-inference",
      });

      console.log("[HFTranscriptionService] success, result:", JSON.stringify(result));
      return result.text;
    } catch (e) {
      console.error("[HFTranscriptionService] error:", e);
      if (e instanceof Error) {
        console.error("[HFTranscriptionService] error message:", e.message);
        console.error("[HFTranscriptionService] error stack:", e.stack);
      }
      throw e;
    }
  }
}
