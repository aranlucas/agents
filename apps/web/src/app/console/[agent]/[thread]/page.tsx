import { notFound } from "next/navigation";
import { ConsoleWorkspace } from "@/components/chat/console-workspace";
import { isConsoleAgentId } from "@/components/chat/agents/registry";
import { requireConsoleAuth } from "@/lib/console-auth.server";

export default async function Page({
  params,
}: {
  params: Promise<{ agent: string; thread: string }>;
}) {
  const { agent, thread } = await params;
  if (!isConsoleAgentId(agent)) notFound();
  await requireConsoleAuth(agent);

  return <ConsoleWorkspace agentId={agent} threadId={thread} />;
}
