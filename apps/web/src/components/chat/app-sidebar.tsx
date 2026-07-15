"use client";

import Link from "next/link";
import { HistoryIcon, PencilIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  SidebarSeparator,
} from "@agents/ui";

import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { useConsoleThreads } from "@/components/chat/console-threads";

export const SETTINGS_PATH = "/console/settings";
const sessionDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function AgentSessions({ agentId, activeThreadId }: { agentId: AgentId; activeThreadId: string }) {
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] });
  const { threads, isLoading, error, refetchThreads, isAuthenticated } = useConsoleThreads();
  const wasRunning = useRef(false);
  const visibleSessions = threads.some((thread) => thread.id === activeThreadId)
    ? threads
    : [{ id: activeThreadId, name: null, updatedAt: null }, ...threads];

  useEffect(() => {
    if (agent?.isRunning) {
      wasRunning.current = true;
      return;
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      refetchThreads();
    }
  }, [agent?.isRunning, refetchThreads]);

  if (!isAuthenticated) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sessions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {isLoading ? (
            <>
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton showIcon />
            </>
          ) : (
            <>
              {visibleSessions.map((session) => {
                const label =
                  session.name ??
                  (session.updatedAt === null
                    ? "Current session"
                    : sessionDate.format(new Date(session.updatedAt)));
                return (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton
                      render={<Link href={`/console/${agentId}/${session.id}`} />}
                      isActive={session.id === activeThreadId}
                      tooltip={label}
                    >
                      <HistoryIcon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {error ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Retry loading sessions"
                    onClick={() => refetchThreads()}
                  >
                    <RefreshCwIcon />
                    <span>Retry sessions</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar({
  onNewThread,
  activePath,
  agentId,
  activeThreadId,
}: {
  onNewThread?: () => void;
  activePath?: string;
  agentId?: AgentId;
  activeThreadId?: string;
}) {
  const settingsActive = activePath === SETTINGS_PATH;
  const sidebarName = agentId ? getAgentConfig(agentId).label : "Agents";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" aria-label="All agents" />}
              tooltip="All agents"
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                A
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{sidebarName}</span>
                <span className="truncate text-xs text-muted-foreground">Agent console</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {onNewThread && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="New thread" onClick={onNewThread}>
                    <PencilIcon />
                    <span>New thread</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {agentId && activeThreadId ? (
          <AgentSessions agentId={agentId} activeThreadId={activeThreadId} />
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={SETTINGS_PATH} />}
              isActive={settingsActive}
              tooltip="Settings"
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <div className="flex items-center justify-center p-2">
          <div className="size-2.5 rounded-full bg-success" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
