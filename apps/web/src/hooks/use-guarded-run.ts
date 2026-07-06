"use client";

import { useCallback, useRef, useState } from "react";

// Wraps agent-run actions so a rejected run surfaces as inline UI state
// (with retry) instead of vanishing as an unhandled rejection.
export function useGuardedRun() {
  const [error, setError] = useState<Error | null>(null);
  const lastActionRef = useRef<(() => Promise<void>) | null>(null);

  const run = useCallback(async (action: () => Promise<void>) => {
    lastActionRef.current = action;
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }, []);

  const retry = useCallback(async () => {
    const action = lastActionRef.current;
    if (action) await run(action);
  }, [run]);

  return { error, run, retry };
}
