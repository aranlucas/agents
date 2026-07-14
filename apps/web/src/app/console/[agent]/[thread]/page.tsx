import { notFound } from "next/navigation";
import { ConsoleWorkspace } from "@/components/chat/console-workspace";
import { isConsoleAgentId } from "@/components/chat/agents/registry";

export default async function Page({
  params,
}: {
  params: Promise<{ agent: string; thread: string }>;
}) {
  const { agent, thread } = await params;
  if (!isConsoleAgentId(agent)) notFound();

  return <ConsoleWorkspace agentId={agent} threadId={thread} />;
}
