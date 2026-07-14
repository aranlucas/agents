import { notFound, redirect } from "next/navigation";
import { isConsoleAgentId } from "@/components/chat/agents/registry";

export default async function Page({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  if (!isConsoleAgentId(agent)) notFound();
  redirect(`/console/${agent}/${crypto.randomUUID()}`);
}
