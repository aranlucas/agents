"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useThreads } from "@copilotkit/react-core/v2";

import type { AgentId } from "@/components/chat/agents/registry";

type ConsoleThreadsValue = ReturnType<typeof useThreads> & {
  isAuthenticated: boolean;
};

const ConsoleThreadsContext = createContext<ConsoleThreadsValue | null>(null);

export function ConsoleThreadsProvider({
  agentId,
  enabled,
  children,
}: {
  agentId: AgentId;
  enabled: boolean;
  children: ReactNode;
}) {
  const threads = useThreads({ agentId, enabled });
  const value = useMemo(() => ({ ...threads, isAuthenticated: enabled }), [enabled, threads]);
  return <ConsoleThreadsContext value={value}>{children}</ConsoleThreadsContext>;
}

export function useConsoleThreads() {
  const value = useContext(ConsoleThreadsContext);
  if (!value) throw new Error("useConsoleThreads must be used within ConsoleSession");
  return value;
}
