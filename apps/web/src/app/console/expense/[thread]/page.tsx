"use client";

import { use } from "react";

import { ExpenseWorkspace } from "@/components/chat/expense-workspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <ExpenseWorkspace key={`expense:${thread}`} threadId={thread} />;
}
