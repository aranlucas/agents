"use client";
import type { ElementRef, RefObject } from "react";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";
import * as Sentry from "@sentry/nextjs";

type AnswerRecorderRef = ElementRef<typeof CopilotChatAudioRecorder>;
export type MicrophonePermissionState = "checking" | "prompt" | "requesting" | "granted" | "denied";

export interface UseAnswerRecorder {
  recording: boolean;
  transcribing: boolean;
  micSupported: boolean;
  micPermission: MicrophonePermissionState;
  error: string | null;
  clearError: () => void;
  requestPermission: () => Promise<boolean>;
  toggle: () => Promise<void>;
  recorderRef: RefObject<AnswerRecorderRef | null>;
}

function subscribeToMicrophoneSupport(): () => void {
  return () => undefined;
}

function getMicrophoneSupportSnapshot(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function useAnswerRecorder(onTranscript: (text: string) => void): UseAnswerRecorder {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const micSupported = useSyncExternalStore(
    subscribeToMicrophoneSupport,
    getMicrophoneSupportSnapshot,
    () => false,
  );
  const [permissionState, setMicPermission] = useState<MicrophonePermissionState>("checking");
  const micPermission = micSupported ? permissionState : "denied";
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AnswerRecorderRef | null>(null);
  const recordingRef = useRef(false);
  const mountedRef = useRef(true);
  const permissionRequestRef = useRef<Promise<boolean> | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    mountedRef.current = true;
    if (!micSupported) {
      return () => {
        mountedRef.current = false;
      };
    }

    const permission = navigator.permissions?.query({ name: "microphone" });
    void (permission ?? Promise.resolve({ state: "prompt" as const }))
      .then((status) => {
        if (!mountedRef.current) return;
        setMicPermission(status.state === "granted" ? "granted" : status.state);
      })
      .catch(() => {
        if (mountedRef.current) setMicPermission("prompt");
      });

    return () => {
      mountedRef.current = false;
    };
  }, [micSupported]);

  const requestPermission = useCallback(async () => {
    if (!micSupported || micPermission === "denied") return false;
    if (micPermission === "granted") return true;
    if (permissionRequestRef.current) return permissionRequestRef.current;

    const request = (async () => {
      setError(null);
      setMicPermission("requesting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) track.stop();
        if (!mountedRef.current) return false;
        setMicPermission("granted");
        return true;
      } catch (cause) {
        const expectedDenial =
          cause instanceof DOMException &&
          (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError");
        if (!expectedDenial) {
          Sentry.captureException(cause, {
            tags: { component: "oralboards_recorder", operation: "microphone.permission" },
          });
        }
        if (mountedRef.current) {
          setMicPermission("denied");
          setError("Microphone access is blocked. Enable it in your browser settings.");
        }
        return false;
      }
    })();
    permissionRequestRef.current = request;
    try {
      return await request;
    } finally {
      permissionRequestRef.current = null;
    }
  }, [micPermission, micSupported]);

  const toggle = useCallback(async () => {
    if (micPermission !== "granted") return;
    const recorder = recorderRef.current;
    if (!recorder) return;
    setError(null);

    if (!recordingRef.current) {
      recordingRef.current = true;
      setRecording(true);
      try {
        await recorder.start();
      } catch (cause) {
        recordingRef.current = false;
        setRecording(false);
        Sentry.captureException(cause, {
          tags: { component: "oralboards_recorder", operation: "recording.start" },
        });
        setError(cause instanceof Error ? cause.message : "Recording failed");
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
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const { text } = (await res.json()) as { text: string };
        onTranscriptRef.current(text);
      } else {
        const transcriptionError = new Error(`Transcription failed: ${res.statusText}`);
        Sentry.captureException(transcriptionError, {
          tags: { component: "oralboards_recorder", operation: "transcription.response" },
          extra: { status: res.status },
        });
        setError(transcriptionError.message);
      }
    } catch (e) {
      recordingRef.current = false;
      setRecording(false);
      Sentry.captureException(e, {
        tags: { component: "oralboards_recorder", operation: "recording.stop_or_transcribe" },
      });
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }, [micPermission]);

  const clearError = useCallback(() => setError(null), []);

  return {
    recording,
    transcribing,
    micSupported,
    micPermission,
    error,
    clearError,
    requestPermission,
    toggle,
    recorderRef,
  };
}
