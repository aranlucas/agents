"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";
import { ToolRenderer } from "@/components/ToolRenderer";

export default function Page() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "1.25rem" }}>
      <div style={{ height: "calc(100vh - 2.5rem)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "0.75rem", overflow: "hidden" }}>
        <CopilotChat
          labels={{ modalHeaderTitle: "Weekend Trips" }}
          className="h-full"
        />
      </div>
      <ToolRenderer />
    </main>
  );
}
