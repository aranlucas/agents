"use client";

import { Button } from "@agents/ui";

export interface SampleAudioButtonProps {
  onTranscribed: (text: string) => void;
  sampleText: string;
}

export function SampleAudioButton({ onTranscribed, sampleText }: SampleAudioButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="voice-sample-audio-button"
      onClick={() => onTranscribed(sampleText)}
      title={`Inserts: "${sampleText}"`}
    >
      <span aria-hidden>🎙</span>
      <span>Try a sample audio</span>
    </Button>
  );
}
