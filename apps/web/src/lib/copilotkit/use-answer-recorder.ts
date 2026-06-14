"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";

export type AnswerRecorderRef = React.ElementRef<typeof CopilotChatAudioRecorder>;

export interface UseAnswerRecorder {
  recording: boolean;
  transcribing: boolean;
  micSupported: boolean;
  error: string | null;
  clearError: () => void;
  toggle: () => Promise<void>;
  recorderRef: React.RefObject<AnswerRecorderRef | null>;
}

export function useAnswerRecorder(
  onTranscript: (text: string) => void,
): UseAnswerRecorder {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AnswerRecorderRef | null>(null);
  const recordingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setMicSupported(typeof navigator.mediaDevices?.getUserMedia === "function");
  }, []);

  const toggle = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setError(null);

    if (!recordingRef.current) {
      recordingRef.current = true;
      setRecording(true);
      try {
        await recorder.start();
      } catch {
        recordingRef.current = false;
        setRecording(false);
      }
      return;
    }

    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      recordingRef.current = false;
      setRecording(false);
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
        setError(`Transcription failed: ${res.statusText}`);
      }
    } catch (e) {
      recordingRef.current = false;
      setRecording(false);
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { recording, transcribing, micSupported, error, clearError, toggle, recorderRef };
}