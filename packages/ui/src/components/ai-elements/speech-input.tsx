"use client";

import { Button } from "@agents/ui/components/button";
import { Spinner } from "@agents/ui/components/spinner";
import { cn } from "@agents/ui/lib/utils";
import { MicIcon, SquareIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none";

export type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void;
  /**
   * Callback for when audio is recorded using MediaRecorder fallback.
   * This is called in browsers that don't support the Web Speech API (Firefox, Safari).
   * The callback receives an audio Blob that should be sent to a transcription service.
   * Return the transcribed text, which will be passed to onTranscriptionChange.
   */
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
  lang?: string;
};

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === "undefined") {
    return "none";
  }

  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
    return "speech-recognition";
  }

  if ("MediaRecorder" in window && "mediaDevices" in navigator) {
    return "media-recorder";
  }

  return "none";
};

export const SpeechInput = ({
  className,
  onTranscriptionChange,
  onAudioRecorded,
  lang = "en-US",
  ...props
}: SpeechInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [mode] = useState<SpeechInputMode>(detectSpeechInputMode);
  const [isRecognitionReady, setIsRecognitionReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaRecorderCleanupRef = useRef<(() => void) | null>(null);
  const mediaRequestGenerationRef = useRef(0);
  const mediaStartInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const onTranscriptionChangeRef =
    useRef<SpeechInputProps["onTranscriptionChange"]>(onTranscriptionChange);
  const onAudioRecordedRef = useRef<SpeechInputProps["onAudioRecorded"]>(onAudioRecorded);

  useEffect(() => {
    onTranscriptionChangeRef.current = onTranscriptionChange;
    onAudioRecordedRef.current = onAudioRecorded;
  }, [onAudioRecorded, onTranscriptionChange]);

  // Initialize Speech Recognition when mode is speech-recognition
  useEffect(() => {
    if (mode !== "speech-recognition") {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const speechRecognition = new SpeechRecognition();

    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = lang;

    const handleStart = () => {
      setIsListening(true);
    };

    const handleEnd = () => {
      setIsListening(false);
    };

    const handleResult = (event: Event) => {
      const speechEvent = event as SpeechRecognitionEvent;
      let finalTranscript = "";

      for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i += 1) {
        const result = speechEvent.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? "";
        }
      }

      if (finalTranscript) {
        onTranscriptionChangeRef.current?.(finalTranscript);
      }
    };

    const handleError = () => {
      setIsListening(false);
    };

    speechRecognition.addEventListener("start", handleStart);
    speechRecognition.addEventListener("end", handleEnd);
    speechRecognition.addEventListener("result", handleResult);
    speechRecognition.addEventListener("error", handleError);

    recognitionRef.current = speechRecognition;
    // Readiness is established by the browser object created in this effect.
    // oxlint-disable-next-line react/set-state-in-effect
    setIsRecognitionReady(true);

    return () => {
      speechRecognition.removeEventListener("start", handleStart);
      speechRecognition.removeEventListener("end", handleEnd);
      speechRecognition.removeEventListener("result", handleResult);
      speechRecognition.removeEventListener("error", handleError);
      speechRecognition.stop();
      recognitionRef.current = null;
      setIsRecognitionReady(false);
    };
  }, [mode, lang]);

  // Cleanup MediaRecorder and stream on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      mediaRequestGenerationRef.current += 1;
      mediaStartInFlightRef.current = false;

      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderCleanupRef.current?.();
      mediaRecorderCleanupRef.current = null;
      mediaRecorderRef.current = null;
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, []);

  // Start MediaRecorder recording
  const startMediaRecorder = useCallback(async () => {
    if (
      !mountedRef.current ||
      !onAudioRecordedRef.current ||
      mediaStartInFlightRef.current ||
      mediaRecorderRef.current
    ) {
      return;
    }

    const requestGeneration = mediaRequestGenerationRef.current + 1;
    mediaRequestGenerationRef.current = requestGeneration;
    mediaStartInFlightRef.current = true;
    setIsStarting(true);

    let stream: MediaStream | null = null;
    let cleanupRecorder: (() => void) | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || mediaRequestGenerationRef.current !== requestGeneration) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      const activeStream = stream;
      streamRef.current = activeStream;
      const mediaRecorder = new MediaRecorder(activeStream);
      audioChunksRef.current = [];

      const handleDataAvailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      const handleStop = async () => {
        cleanupRecorder?.();
        for (const track of activeStream.getTracks()) {
          track.stop();
        }
        if (streamRef.current === activeStream) {
          streamRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        audioChunksRef.current = [];

        if (audioBlob.size > 0 && onAudioRecordedRef.current) {
          if (mountedRef.current) {
            setIsProcessing(true);
          }
          try {
            const transcript = await onAudioRecordedRef.current(audioBlob);
            if (transcript && mountedRef.current) {
              onTranscriptionChangeRef.current?.(transcript);
            }
          } catch {
            // Error handling delegated to the onAudioRecorded caller
          } finally {
            if (mountedRef.current) {
              setIsProcessing(false);
            }
          }
        }
      };

      const handleError = () => {
        cleanupRecorder?.();
        if (mountedRef.current) {
          setIsListening(false);
        }
        for (const track of activeStream.getTracks()) {
          track.stop();
        }
        if (streamRef.current === activeStream) {
          streamRef.current = null;
        }
      };

      cleanupRecorder = () => {
        mediaRecorder.removeEventListener("dataavailable", handleDataAvailable);
        mediaRecorder.removeEventListener("stop", handleStop);
        mediaRecorder.removeEventListener("error", handleError);
        if (mediaRecorderRef.current === mediaRecorder) {
          mediaRecorderRef.current = null;
        }
        if (mediaRecorderCleanupRef.current === cleanupRecorder) {
          mediaRecorderCleanupRef.current = null;
        }
      };

      mediaRecorder.addEventListener("dataavailable", handleDataAvailable);
      mediaRecorder.addEventListener("stop", handleStop);
      mediaRecorder.addEventListener("error", handleError);

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorderCleanupRef.current = cleanupRecorder;
      mediaRecorder.start();
      if (mountedRef.current) {
        setIsListening(true);
      }
    } catch {
      cleanupRecorder?.();
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        if (streamRef.current === stream) {
          streamRef.current = null;
        }
      }
      if (mountedRef.current && mediaRequestGenerationRef.current === requestGeneration) {
        setIsListening(false);
      }
    } finally {
      if (mediaRequestGenerationRef.current === requestGeneration) {
        mediaStartInFlightRef.current = false;
        if (mountedRef.current) {
          setIsStarting(false);
        }
      }
    }
  }, []);

  // Stop MediaRecorder recording
  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (mode === "speech-recognition" && recognitionRef.current) {
      if (isListening) {
        recognitionRef.current.stop();
      } else {
        recognitionRef.current.start();
      }
    } else if (mode === "media-recorder") {
      if (isListening) {
        stopMediaRecorder();
      } else {
        startMediaRecorder();
      }
    }
  }, [mode, isListening, startMediaRecorder, stopMediaRecorder]);

  // Determine if button should be disabled
  const isDisabled =
    mode === "none" ||
    (mode === "speech-recognition" && !isRecognitionReady) ||
    (mode === "media-recorder" && !onAudioRecorded) ||
    isStarting ||
    isProcessing;
  const isBusy = isStarting || isProcessing;
  const accessibleLabel = isProcessing
    ? "Transcribing audio"
    : isStarting
      ? "Requesting microphone access"
      : isListening
        ? "Stop recording"
        : "Start voice input";

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Animated pulse rings */}
      {isListening &&
        [0, 1, 2].map((index) => (
          <div
            className="absolute inset-0 animate-ping rounded-full border-2 border-red-400/30"
            key={index}
            style={{
              animationDelay: `${index * 0.3}s`,
              animationDuration: "2s",
            }}
          />
        ))}

      {/* Main record button */}
      <Button
        aria-busy={isBusy}
        aria-label={accessibleLabel}
        className={cn(
          "relative z-10 rounded-full transition-all duration-300",
          isListening
            ? "bg-destructive text-white hover:bg-destructive/80"
            : "bg-primary text-primary-foreground hover:bg-primary/80",
          className,
        )}
        disabled={isDisabled}
        onClick={toggleListening}
        {...props}
      >
        {isBusy && <Spinner />}
        {!isBusy && isListening && <SquareIcon className="size-4" />}
        {!(isBusy || isListening) && <MicIcon className="size-4" />}
      </Button>
    </div>
  );
};
