"use client";

import { useEffect } from "react";
import { useAgent, useHumanInTheLoop, UseAgentUpdate } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { ApprovalCard } from "@/components/approval-dialog";
import { toTripState } from "@/lib/agent-state";

import type { AgentId } from "./registry";

type ApprovalAgentId = Extract<AgentId, "travel" | "grocery">;

export const GROCERY_APPROVAL_DESCRIPTION =
  "Pause and ask the operator to approve a sensitive Kroger action " +
  "(add items to the live Kroger cart or start checkout). " +
  "Returns { approved: boolean, note?: string }.";

function SensitiveActionApprovalHooks({
  agentId,
  description,
  markTravelBooked = false,
}: {
  agentId: ApprovalAgentId;
  description: string;
  markTravelBooked?: boolean;
}) {
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] });

  useHumanInTheLoop({
    name: "request_user_approval",
    description,
    parameters: z.object({
      action: z.string().describe("Short, specific description of the action to take."),
      reason: z.string().optional().describe("One sentence on why this action is being proposed."),
    }),
    render: ({ status, args, respond }) => {
      const statusText = status.valueOf();
      if (statusText !== "executing" || !respond) {
        return (
          <div className="bg-secondary text-muted-foreground my-2 rounded-lg border border-(--border-soft) px-3 py-2 text-xs">
            {statusText === "complete" ? "Decision recorded." : "Preparing approval..."}
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
              if (decision.approved && markTravelBooked && agent) {
                const current = toTripState(agent.state);
                agent.setState({ ...current, status: "booked" });
              }
              void respond(decision);
            },
          }}
        />
      );
    },
  });

  // `useHumanInTheLoop` drops its renderer on unmount; if that happens mid-run
  // the run's Promise is abandoned and the thread stays locked.
  useEffect(() => {
    return () => {
      if (agent?.isRunning) agent.abortRun();
    };
  }, [agent]);

  return null;
}

export function TravelHooks() {
  return (
    <SensitiveActionApprovalHooks
      agentId="travel"
      description={
        "Pause and ask the operator to approve a sensitive trip action " +
        "(book flights, reserve hotels, share itinerary, charge card). " +
        "Returns { approved: boolean, note?: string }."
      }
      markTravelBooked
    />
  );
}

export function GroceryHooks() {
  return (
    <SensitiveActionApprovalHooks agentId="grocery" description={GROCERY_APPROVAL_DESCRIPTION} />
  );
}
