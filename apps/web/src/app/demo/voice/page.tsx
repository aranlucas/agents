"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { useState } from "react";

import { ConsoleSession } from "@/components/chat/console-session";

export default function VoiceDemoPage() {
  const [thread] = useState(() => crypto.randomUUID());

  return (
    <ConsoleSession agent="resume" thread={thread}>
      <div className="mx-auto flex h-dvh max-w-3xl flex-col px-4">
        <header className="py-4">
          <h1 className="text-lg font-semibold">Voice Demo</h1>
        </header>
        <div className="flex-1 overflow-hidden rounded-lg border">
          <CopilotChat className="h-full" />
        </div>
      </div>
    </ConsoleSession>
  );
}
