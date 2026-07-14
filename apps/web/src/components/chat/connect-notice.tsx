"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";

import { Button } from "@agents/ui";

export function ConnectNotice({ agentLabel }: { agentLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-secondary px-6 py-5 text-center">
      <div className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
        <LockIcon className="size-4" />
      </div>
      <p className="text-sm text-foreground">
        Connect your <span className="font-medium">Kroger</span> account to use {agentLabel}.
      </p>
      <Button render={<Link href="/console/settings" />} size="sm">
        Open settings
      </Button>
    </div>
  );
}
