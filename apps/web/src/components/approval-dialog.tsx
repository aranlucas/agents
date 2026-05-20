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
