"use client";

import { useEffect, useRef } from "react";
import {
  useAgent,
  useConfigureSuggestions,
  useHumanInTheLoop,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import { z } from "zod";

import { ApprovalCard } from "@/components/approval-dialog";
import { toTripState } from "@/lib/agent-state";

/**
 * Travel-specific frontend wiring for the console: the human-in-the-loop
 * approval tool and suggestion pills.
 *
 * `useHumanInTheLoop` registers a renderer keyed by the tool name, which the
 * console's `useRenderToolCall()` loop resolves inline in the conversation —
 * so the approval card appears where the tool call happens (no modal, no
 * duplicate generic card). The synthesized handler resolves only when
 * `respond` is called, so every branch must call it.
 */
export function TravelHooks() {
  const { agent } = useAgent({ agentId: "travel", updates: [UseAgentUpdate.OnRunStatusChanged] });

  useHumanInTheLoop({
    name: "request_user_approval",
    description:
      "Pause and ask the operator to approve a sensitive trip action " +
      "(book flights, reserve hotels, share itinerary, charge card). " +
      "Returns { approved: boolean, note?: string }.",
    parameters: z.object({
      action: z.string().describe("Short, specific description of the action to take."),
      reason: z
        .string()
        .optional()
        .describe("One sentence on why this action is being proposed (cost, tradeoff, deadline)."),
    }),
    render: ({ status, args, respond }) => {
      if (status !== "executing" || !respond) {
        return (
          <div className="my-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--ink-mute)]">
            {status === "complete" ? "Decision recorded." : "Preparing approval…"}
          </div>
        );
      }
      return (
        <ApprovalCard
          request={{
            id: "approval",
            action: args.action ?? "this action",
            reason: args.reason ?? "",
            resolve: (decision) => {
              if (decision.approved && agent) {
                const current = toTripState(agent.state);
                agent.setState({ ...current, status: "booked" });
              }
              respond(decision);
            },
          }}
        />
      );
    },
  });

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Weekend in Tokyo",
        message: "Plan a 3-day weekend in Tokyo focused on food, late November.",
      },
      {
        title: "Family in Lisbon",
        message: "Plan a 5-day family trip to Lisbon next summer, kids 7 and 10.",
      },
      {
        title: "Rework Day 2",
        message:
          "Day 2 feels too packed — rework it with a slower morning and one anchor activity in the afternoon.",
      },
      {
        title: "Ready to book?",
        message: "If the itinerary looks good, propose locking it in and ask for my approval.",
      },
    ],
    available: "always",
  });

  // `useHumanInTheLoop` drops its renderer on unmount; if that happens mid-
  // executing the run's Promise is abandoned and the thread stays locked.
  // Abort the run on unmount, reading the latest isRunning via a ref.
  const runningRef = useRef(false);
  useEffect(() => {
    runningRef.current = agent?.isRunning ?? false;
  }, [agent?.isRunning]);
  useEffect(() => {
    return () => {
      if (runningRef.current) agent?.abortRun();
    };
  }, [agent]);

  return null;
}
