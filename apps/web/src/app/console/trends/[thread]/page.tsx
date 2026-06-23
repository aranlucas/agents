"use client";

import { use } from "react";

import { AgentWorkspace } from "@/components/chat/agent-workspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <AgentWorkspace key={`trends:${thread}`} agentId="trends" threadId={thread} />;
}
