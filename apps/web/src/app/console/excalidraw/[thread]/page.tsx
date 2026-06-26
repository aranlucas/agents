"use client";

import { use } from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";

import { SidebarInset, SidebarProvider } from "@agents/ui";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { useNewThread } from "@/components/chat/use-new-thread";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { cssVars } from "@/lib/css";

const config = getAgentConfig("excalidraw");

function ExcalidrawChat() {
  const startNewThread = useNewThread("excalidraw");

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <AppSidebar activePath="/console/excalidraw" onNewThread={startNewThread} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="flex h-full flex-col">
          <CopilotChat className="h-full" labels={{ chatInputPlaceholder: config.placeholder }} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  use(params);
  return <ExcalidrawChat />;
}
