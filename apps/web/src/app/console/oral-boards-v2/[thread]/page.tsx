"use client";

import { use } from "react";

import { OralBoardsWorkspace } from "@/components/chat/oral-boards-workspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <OralBoardsWorkspace key={`oral-boards-v2:${thread}`} agentId="oral-boards-v2" />;
}
