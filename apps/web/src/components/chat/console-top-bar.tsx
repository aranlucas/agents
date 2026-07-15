"use client";

import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react";

import { Badge, Separator, SidebarTrigger } from "@agents/ui";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@agents/ui/components/breadcrumb";
import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { useConsoleThreads } from "@/components/chat/console-threads";

const sessionDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function ConsoleTopBar({
  agentId,
  threadId,
  isRunning,
}: {
  agentId: AgentId;
  threadId: string;
  isRunning: boolean | undefined;
}) {
  const config = getAgentConfig(agentId);
  const { threads } = useConsoleThreads();
  const activeSession = threads.find((thread) => thread.id === threadId);
  const sessionLabel = activeSession
    ? (activeSession.name ?? sessionDate.format(new Date(activeSession.updatedAt)))
    : "Current session";
  const status = isRunning === undefined ? "Connecting" : isRunning ? "Working" : "Ready";

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <span className="truncate text-muted-foreground">{config.label}</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{sessionLabel}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Badge variant="outline" className="ms-auto">
        {isRunning === false ? (
          <CircleCheckIcon data-icon="inline-start" />
        ) : (
          <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
        )}
        {status}
      </Badge>
    </header>
  );
}
