"use client";

import { use } from "react";

import { PresentationWorkspace } from "@/components/chat/presentation-workspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <PresentationWorkspace key={`presentation:${thread}`} threadId={thread} />;
}
