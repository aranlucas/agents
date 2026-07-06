"use client";

import { Component, type ReactNode } from "react";
import { AlertCircleIcon, PlayIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@agents/ui";

type Props = { onReset: () => void; children: ReactNode };
type State = { error: Error | null };

// The exam panel renders LLM-written state; a single malformed value must
// degrade to this card instead of unmounting the whole page.
export class OralBoardsErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>
              The exam view hit an unexpected error: {error.message}. Start a new case to continue
              practicing.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          >
            <PlayIcon className="size-3.5" />
            Start a new case
          </Button>
        </div>
      </div>
    );
  }
}
