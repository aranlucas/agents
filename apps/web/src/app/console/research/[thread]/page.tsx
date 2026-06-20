"use client";

import { use } from "react";

import { AgentWorkspace } from "@/components/chat/agent-workspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <AgentWorkspace key={`research:${thread}`} agentId="research" threadId={thread} />;
}
