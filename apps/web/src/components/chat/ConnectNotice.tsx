"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PROVIDERS, type ProviderId } from "@/lib/connections";

/** Joins labels as "Strava", "Strava and Kroger", "A, B, and C". */
function joinLabels(missing: ProviderId[]): string {
  const labels = missing.map((id) => PROVIDERS[id].label);
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function ConnectNotice({
  agentLabel,
  missing,
}: {
  agentLabel: string;
  missing: ProviderId[];
}) {
  const accountWord = missing.length > 1 ? "accounts" : "account";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-6 py-5 text-center">
      <div className="grid size-9 place-items-center rounded-full bg-[var(--bg-soft)] text-[var(--ink-mute)]">
        <LockIcon className="size-4" />
      </div>
      <p className="text-sm text-[var(--ink)]">
        Connect your <span className="font-medium">{joinLabels(missing)}</span> {accountWord} to use{" "}
        {agentLabel}.
      </p>
      <Button render={<Link href="/console/settings" />} size="sm">
        Open settings
      </Button>
    </div>
  );
}
