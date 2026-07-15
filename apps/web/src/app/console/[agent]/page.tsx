import { notFound, redirect } from "next/navigation";
import { isConsoleAgentId } from "@/components/chat/agents/registry";
import { requireConsoleAuth } from "@/lib/console-auth.server";

export default async function Page({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  if (!isConsoleAgentId(agent)) notFound();
  await requireConsoleAuth(agent);
  redirect(`/console/${agent}/${crypto.randomUUID()}`);
}
