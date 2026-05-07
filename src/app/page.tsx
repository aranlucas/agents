"use client";

import { useState } from "react";
import {
  CopilotChat,
  useAgent,
  UseAgentUpdate,
  useCopilotKit,
} from "@copilotkit/react-core/v2";
import { ToolRenderer } from "@/components/tool-renderer";
import { TripCanvas } from "@/components/trip-canvas";

function PageInner() {
  const [mobileTab, setMobileTab] = useState<"chat" | "plan">("chat");
  const [threadId] = useState(() => crypto.randomUUID());
  const { copilotkit } = useCopilotKit();
  const { agent } = useAgent({
    agentId: "default",
    threadId,
    updates: [UseAgentUpdate.OnRunStatusChanged],
  });

  const sendMessage = async (content: string) => {
    if (!agent) return;
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
    await copilotkit.runAgent({ agent });
  };

  return (
    <main className="h-full flex flex-col overflow-hidden">
      {/* Mobile tab switcher */}
      <div className="flex md:hidden border-b border-[var(--border)] bg-[var(--bg-card)]">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex-1 py-3 text-xs font-mono tracking-[0.15em] uppercase transition-colors ${
            mobileTab === "chat"
              ? "text-[var(--amber)] border-b-2 border-[var(--amber)]"
              : "text-[var(--cream-muted)] hover:text-[var(--cream)]"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileTab("plan")}
          className={`flex-1 py-3 text-xs font-mono tracking-[0.15em] uppercase transition-colors ${
            mobileTab === "plan"
              ? "text-[var(--amber)] border-b-2 border-[var(--amber)]"
              : "text-[var(--cream-muted)] hover:text-[var(--cream)]"
          }`}
        >
          Trip Plan
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Chat panel */}
        <div
          className={`${
            mobileTab === "chat" ? "flex" : "hidden"
          } md:flex flex-col w-full md:w-[420px] lg:w-[460px] border-r border-[var(--border)] shrink-0 min-h-0`}
        >
          <CopilotChat
            agentId="default"
            threadId={threadId}
            className="flex-1 min-h-0"
          />
          <ToolRenderer />
        </div>

        {/* Trip canvas */}
        <div
          className={`${
            mobileTab === "plan" ? "flex" : "hidden"
          } md:flex flex-1 min-h-0 overflow-auto flex-col`}
        >
          <TripCanvas sendMessage={sendMessage} threadId={threadId} />
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return <PageInner />;
}
