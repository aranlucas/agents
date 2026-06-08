"use client";

import { useEffect, useRef, useState } from "react";
import { useAgent, useConfigureSuggestions, useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { ApprovalDialog, type ApprovalRequest } from "@/components/approval-dialog";
import { toTripState } from "@/lib/agent-state";

/**
 * Travel-specific frontend wiring for the console: the human-in-the-loop
 * approval tool and suggestion pills. Renders the pending approval dialog so
 * `request_user_approval` always resolves (an unresolved handler hangs the run).
 */
export function TravelHooks() {
  const { agent } = useAgent({ agentId: "travel" });
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);

  useFrontendTool({
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
    handler: async ({ action, reason }: { action: string; reason?: string }) => {
      const id = crypto.randomUUID();
      const decision = await new Promise<{ approved: boolean; note?: string }>((resolve) => {
        setPendingApprovals((prev) => [
          ...prev,
          {
            id,
            action,
            reason: reason ?? "",
            resolve: (d) => {
              setPendingApprovals((q) => q.filter((r) => r.id !== id));
              resolve(d);
            },
          },
        ]);
      });

      if (decision.approved && agent) {
        const current = toTripState(agent.state);
        agent.setState({ ...current, status: "booked" });
      }
      return decision;
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

  // Resolve any pending approvals if the user navigates away mid-flow.
  const pendingRef = useRef<ApprovalRequest[]>([]);
  useEffect(() => {
    pendingRef.current = pendingApprovals;
  }, [pendingApprovals]);
  useEffect(() => {
    return () => {
      for (const r of pendingRef.current) r.resolve({ approved: false, note: "navigated away" });
    };
  }, []);

  const head = pendingApprovals[0];
  return head ? <ApprovalDialog request={head} /> : null;
}
