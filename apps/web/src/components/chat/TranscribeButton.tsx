"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";
import { Check, Loader2, Mic, X } from "lucide-react";

import { PromptInputButton, usePromptInputController } from "@/components/ai-elements/prompt-input";

export function TranscribeButton() {
  const { textInput } = usePromptInputController();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const audioRecorderRef = useRef<React.ElementRef<typeof CopilotChatAudioRecorder>>(null);

  const [micSupported, setMicSupported] = useState(false);
  useEffect(() => {
    setMicSupported(typeof navigator.mediaDevices?.getUserMedia === "function");
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const recorder = audioRecorderRef.current;
    if (!recorder) return;

    setIsTranscribing(true);
    try {
      const blob = await recorder.stop();
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/copilotkit/transcribe", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        console.error("Transcription failed:", err);
        return;
      }
      const { text } = await res.json();
      textInput.setInput(textInput.value ? `${textInput.value} ${text}` : text);
    } catch (e) {
      console.error("Transcription failed:", e);
    } finally {
      setIsTranscribing(false);
      setIsRecording(false);
    }
  }, [textInput]);

  const startRecording = useCallback(async () => {
    const recorder = audioRecorderRef.current;
    if (!recorder) return;

    setIsRecording(true);
    try {
      await recorder.start();
    } catch (e) {
      console.error("Recording failed:", e);
      setIsRecording(false);
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    const recorder = audioRecorderRef.current;
    if (!recorder) return;

    try {
      await recorder.stop();
    } catch (e) {
      console.error("Cancel recording failed:", e);
    } finally {
      setIsRecording(false);
    }
  }, []);

  if (!micSupported) return null;

  return (
    <>
      <CopilotChatAudioRecorder ref={audioRecorderRef} />
      {isRecording ? (
        <>
          <PromptInputButton
            aria-label="Cancel recording"
            disabled={isTranscribing}
            onClick={cancelRecording}
            tooltip="Cancel recording"
          >
            <X className="size-4" />
          </PromptInputButton>
          <PromptInputButton
            aria-label="Transcribe recording"
            disabled={isTranscribing}
            onClick={stopAndTranscribe}
            tooltip="Transcribe recording"
          >
            {isTranscribing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
          </PromptInputButton>
        </>
      ) : (
        <PromptInputButton
          aria-label="Start recording"
          disabled={isTranscribing}
          onClick={startRecording}
          tooltip="Voice input"
        >
          {isTranscribing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Mic className="size-4" />
          )}
        </PromptInputButton>
      )}
    </>
  );
}
