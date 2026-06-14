"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";

export type AnswerRecorderRef = React.ElementRef<typeof CopilotChatAudioRecorder>;

export interface UseAnswerRecorder {
  recording: boolean;
  transcribing: boolean;
  micSupported: boolean;
  toggle: () => Promise<void>;
  recorderRef: React.RefObject<AnswerRecorderRef | null>;
}

export function useAnswerRecorder(
  onTranscript: (text: string) => void,
): UseAnswerRecorder {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recorderRef = useRef<AnswerRecorderRef | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setMicSupported(typeof navigator.mediaDevices?.getUserMedia === "function");
  }, []);

  const toggle = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (!recording) {
      setRecording(true);
      try {
        await recorder.start();
      } catch {
        setRecording(false);
      }
      return;
    }

    setRecording(false);
    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/copilotkit/transcribe", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const { text } = (await res.json()) as { text: string };
        onTranscriptRef.current(text);
      } else {
        console.error("Transcription failed:", res.statusText);
      }
    } catch (e) {
      console.error("Transcription failed:", e);
    } finally {
      setTranscribing(false);
    }
  }, [recording]);

  return { recording, transcribing, micSupported, toggle, recorderRef };
}