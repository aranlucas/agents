import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ConsoleSession } from "@/components/chat/console-session";
import { isConsoleAgentId } from "@/components/chat/agents/registry";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agent: string; thread: string }>;
}) {
  const { agent, thread } = await params;
  if (!isConsoleAgentId(agent)) notFound();

  return (
    <ConsoleSession agent={agent} thread={thread}>
      {children}
    </ConsoleSession>
  );
}
