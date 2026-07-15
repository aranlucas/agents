import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ConsoleSession } from "@/components/chat/console-session";
import { isConsoleAgentId } from "@/components/chat/agents/registry";
import { getResumeToken } from "@/lib/resume-snapshot.server";

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agent: string; thread: string }>;
}) {
  const { agent, thread } = await params;
  if (!isConsoleAgentId(agent)) notFound();
  if (agent !== "resume") {
    const { isAuthenticated } = await auth();
    if (!isAuthenticated) notFound();
  }
  const initialToken = agent === "resume" ? await getResumeToken() : undefined;

  return (
    <ConsoleSession agent={agent} thread={thread} initialToken={initialToken}>
      {children}
    </ConsoleSession>
  );
}
