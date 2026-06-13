import { notFound, redirect } from "next/navigation";

import { isAgentId } from "@/components/chat/agents/registry";

// Bare `/console/<agent>` has no thread yet. Mint one and redirect so the active
// thread always lives in the URL — making the conversation refreshable and
// shareable, and giving CopilotKit/ADK a stable session key (see [thread]/page).
export default async function Page({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  if (!isAgentId(agent)) notFound();
  redirect(`/console/${agent}/${crypto.randomUUID()}`);
}
