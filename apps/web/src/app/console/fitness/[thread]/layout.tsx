"use client";

import { use, type ReactNode } from "react";

import { ConsoleSession } from "@/components/chat/console-session";

export default function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ thread: string }>;
}) {
  const { thread } = use(params);
  return (
    <ConsoleSession agent="fitness" thread={thread}>
      {children}
    </ConsoleSession>
  );
}
