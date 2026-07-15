import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isConsoleAgentId } from "@/components/chat/agents/registry";

export default async function Page({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  if (!isConsoleAgentId(agent)) notFound();
  if (agent !== "resume") {
    const { isAuthenticated } = await auth();
    if (!isAuthenticated) redirect("/sign-in");
  }
  redirect(`/console/${agent}/${crypto.randomUUID()}`);
}
