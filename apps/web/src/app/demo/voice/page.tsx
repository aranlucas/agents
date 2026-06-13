"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";
import { CopilotChat } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";

export default function VoiceDemoPage() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="resume"
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      <div className="mx-auto flex h-dvh max-w-3xl flex-col px-4">
        <header className="py-4">
          <h1 className="text-lg font-semibold">Voice Demo</h1>
        </header>
        <div className="flex-1 overflow-hidden rounded-lg border">
          <CopilotChat className="h-full" />
        </div>
      </div>
    </CopilotKit>
  );
}
