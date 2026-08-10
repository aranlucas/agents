"use client";

import type { ReactNode } from "react";

import { AlertCircleIcon, PlayIcon } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

import { Alert, AlertDescription, AlertTitle, Button } from "@agents/ui";

type Props = { onReset: () => void; children: ReactNode };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown rendering error";
}

type FallbackProps = { error: unknown; resetError: () => void };

export function OralBoardsErrorFallback({ error, resetError }: FallbackProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            The exam view hit an unexpected error: {errorMessage(error)}. Start a new case to
            continue practicing.
          </AlertDescription>
        </Alert>
        <Button type="button" className="w-full" onClick={resetError}>
          <PlayIcon className="size-3.5" />
          Start a new case
        </Button>
      </div>
    </div>
  );
}

// The exam panel renders LLM-written state; a single malformed value must
// degrade to this card instead of unmounting the whole page.
export function OralBoardsErrorBoundary({ onReset, children }: Props) {
  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope) => scope.setTag("component", "oralboards_error_boundary")}
      onReset={onReset}
      fallback={OralBoardsErrorFallback}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
