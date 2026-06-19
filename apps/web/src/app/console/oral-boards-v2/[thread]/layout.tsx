"use client";

import { useEffect, use, type ReactNode } from "react";
import ReactDOM from "react-dom";

import { preloadKokoro } from "@/lib/copilotkit/speak-question";
import { ConsoleSession } from "@/components/chat/console-session";

export default function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ thread: string }>;
}) {
  const { thread } = use(params);

  useEffect(() => {
    ReactDOM.preconnect("https://huggingface.co");
    ReactDOM.preconnect("https://cdn-lfs.huggingface.co");
    void preloadKokoro();
  }, []);

  return (
    <ConsoleSession agent="oral-boards-v2" thread={thread}>
      {children}
    </ConsoleSession>
  );
}
