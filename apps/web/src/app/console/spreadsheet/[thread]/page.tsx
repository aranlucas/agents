"use client";

import { use } from "react";

import { SpreadsheetWorkspace } from "@/components/chat/spreadsheet-workspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <SpreadsheetWorkspace key={`spreadsheet:${thread}`} threadId={thread} />;
}
