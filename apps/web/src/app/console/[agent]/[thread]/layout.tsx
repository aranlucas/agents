import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ConsoleSession } from "@/components/chat/console-session";
import { isConsoleAgentId } from "@/components/chat/agents/registry";
import { requireConsoleAuth } from "@/lib/console-auth.server";
import { getResumeToken } from "@/lib/resume-snapshot.server";

// oxlint-disable-next-line @clerk/next/require-auth-protection -- requireConsoleAuth protects every non-public agent.
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agent: string; thread: string }>;
}) {
  const { agent, thread } = await params;
  if (!isConsoleAgentId(agent)) notFound();
  await requireConsoleAuth(agent);
  const initialToken = agent === "resume" ? await getResumeToken() : undefined;

  return (
    <ConsoleSession agent={agent} thread={thread} initialToken={initialToken}>
      {children}
    </ConsoleSession>
  );
}
