"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";

import { Button } from "@agents/ui";

export function ConnectNotice({ agentLabel }: { agentLabel: string }) {
  return (
    <div className="border-border bg-secondary flex flex-col items-center gap-3 rounded-xl border px-6 py-5 text-center">
      <div className="bg-muted text-muted-foreground grid size-9 place-items-center rounded-full">
        <LockIcon className="size-4" />
      </div>
      <p className="text-foreground text-sm">
        Connect your <span className="font-medium">Kroger</span> account to use {agentLabel}.
      </p>
      <Button render={<Link href="/console/settings" />} size="sm">
        Open settings
      </Button>
    </div>
  );
}
