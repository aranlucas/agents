"use client";

import { use } from "react";

import { OralBoardsWorkspace } from "@/components/chat/OralBoardsWorkspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  // Remount per thread so no client state leaks across switches; the
  // <CopilotKit> provider/session lives one level up in layout.tsx.
  return <OralBoardsWorkspace key={`oral-boards:${thread}`} />;
}
