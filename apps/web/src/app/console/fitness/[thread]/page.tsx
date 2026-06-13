"use client";

import { use } from "react";

import { AgentWorkspace } from "@/components/chat/AgentWorkspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  // Remount per agent+thread so no client state leaks across switches; the
  // <CopilotKit> provider/session lives one level up in layout.tsx.
  return <AgentWorkspace key={`fitness:${thread}`} agentId="fitness" />;
}
