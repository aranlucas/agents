import { notFound } from "next/navigation";
import { ConsoleWorkspace } from "@/components/chat/console-workspace";
import { isConsoleAgentId } from "@/components/chat/agents/registry";
import { loadResumeSnapshot } from "@/lib/resume-snapshot.server";

export default async function Page({
  params,
}: {
  params: Promise<{ agent: string; thread: string }>;
}) {
  const { agent, thread } = await params;
  if (!isConsoleAgentId(agent)) notFound();
  const initialSnapshot = agent === "resume" ? await loadResumeSnapshot(thread) : null;

  return <ConsoleWorkspace agentId={agent} threadId={thread} initialSnapshot={initialSnapshot} />;
}
