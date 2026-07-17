import { describe, expect, it, vi } from "vitest";
import {
  CONNECT_FATAL_CODES,
  observeCopilotOperation,
  RUN_FATAL_CODES,
  type CopilotErrorEvent,
} from "@/lib/copilot-operation";

function createSource() {
  let onError: ((event: CopilotErrorEvent) => void | Promise<void>) | undefined;
  const unsubscribe = vi.fn();
  const source = {
    subscribe: vi.fn((subscriber: { onError?: typeof onError }) => {
      onError = subscriber.onError;
      return { unsubscribe };
    }),
  };
  return {
    emit(event: CopilotErrorEvent) {
      return onError?.(event);
    },
    source,
    unsubscribe,
  };
}

describe("observeCopilotOperation", () => {
  it("subscribes before the run and returns the first matching Grocery run error", async () => {
    const events = createSource();
    const first = new Error("first failure");
    const later = new Error("later failure");
    const run = vi.fn(async () => {
      expect(events.source.subscribe).toHaveBeenCalledOnce();
      await events.emit({ code: "agent_run_failed", context: { agentId: "other" }, error: later });
      await events.emit({ code: "ignored", context: { agentId: "grocery" }, error: later });
      await events.emit({
        code: "agent_run_failed",
        context: { agentId: "grocery" },
        error: first,
      });
      await events.emit({
        code: "agent_run_error_event",
        context: { agentId: "grocery" },
        error: later,
      });
    });

    await expect(
      observeCopilotOperation({
        source: events.source,
        agentId: "grocery",
        fatalCodes: RUN_FATAL_CODES,
        isStopped: () => false,
        run,
      }),
    ).resolves.toBe(first);
    expect(events.unsubscribe).toHaveBeenCalledOnce();
  });

  it("ignores stop-induced emissions and always unsubscribes when the run throws", async () => {
    const events = createSource();
    const thrown = new Error("transport failed");

    await expect(
      observeCopilotOperation({
        source: events.source,
        agentId: "grocery",
        fatalCodes: CONNECT_FATAL_CODES,
        isStopped: () => true,
        run: async () => {
          await events.emit({
            code: "agent_connect_failed",
            context: { agentId: "grocery" },
            error: new Error("cancelled"),
          });
          throw thrown;
        },
      }),
    ).rejects.toBe(thrown);
    expect(events.unsubscribe).toHaveBeenCalledOnce();
  });
});
