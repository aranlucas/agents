"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";

import { Button } from "@agents/ui";
import { PROVIDERS, type ProviderId } from "@/lib/connections";

/** Joins labels as "Strava", "Strava and Kroger", "A, B, and C". */
function joinLabels(missing: ProviderId[]): string {
  const labels = missing.map((id) => PROVIDERS[id].label);
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
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
    <div className="border-border bg-secondary flex flex-col items-center gap-3 rounded-xl border px-6 py-5 text-center">
      <div className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-full">
        <LockIcon className="size-4" />
      </div>
      <p className="text-foreground text-sm">
        Connect your <span className="font-medium">{joinLabels(missing)}</span> {accountWord} to use{" "}
        {agentLabel}.
      </p>
      <Button render={<Link href="/console/settings" />} size="sm">
        Open settings
      </Button>
    </div>
  );
}
