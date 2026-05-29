"use client";

import React, { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ApprovalRequest {
  id: string;
  action: string;
  reason: string;
  resolve: (decision: { approved: boolean; note?: string }) => void;
}

interface Props {
  request: ApprovalRequest;
}

export function ApprovalCard({ request }: Props) {
  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--warning)_38%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface))] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]">
          <TriangleAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--ink)]">
            Approval required
          </div>
          <div className="mt-0.5 text-xs text-[var(--ink-mute)]">
            The agent paused before taking this action.
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
          Proposed action
        </div>
        <div className="text-sm font-medium text-[var(--ink)]">
          {request.action}
        </div>
      </div>

      {request.reason && (
        <div className="mt-2 rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
            Why
          </div>
          <div className="text-sm text-[var(--ink-soft)]">
            {request.reason}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={() =>
            request.resolve({ approved: false, note: "rejected by user" })
          }
          variant="outline"
          size="sm"
          className="w-full"
        >
          Reject
        </Button>
        <Button
          type="button"
          onClick={() => request.resolve({ approved: true })}
          size="sm"
          className="w-full"
        >
          Approve
        </Button>
      </div>
    </div>
  );
}

export function ApprovalDialog({ request }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") request.resolve({ approved: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} className="gap-4 shadow-2xl">
        <DialogHeader className="flex-row items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
            <TriangleAlert className="w-5 h-5 text-[var(--accent-strong)]" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base">
              Approve before continuing
            </DialogTitle>
            <DialogDescription className="text-xs">
              The agent paused and is waiting on you.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border-soft)] px-4 py-3 mb-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-mute)] mb-1 font-mono">
            Proposed action
          </div>
          <div className="text-sm font-medium text-[var(--ink)]">
            {request.action}
          </div>
        </div>

        {request.reason && (
          <div className="rounded-xl bg-[var(--surface-soft)] border border-[var(--border-soft)] px-4 py-3 mb-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-mute)] mb-1 font-mono">
              Why
            </div>
            <div className="text-sm text-[var(--ink-soft)]">
              {request.reason}
            </div>
          </div>
        )}

        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() =>
              request.resolve({ approved: false, note: "rejected by user" })
            }
            variant="outline"
            className="w-full"
          >
            Reject
          </Button>
          <Button
            type="button"
            onClick={() => request.resolve({ approved: true })}
            className="w-full"
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
