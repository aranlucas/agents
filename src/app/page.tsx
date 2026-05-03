"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";
import { ToolRenderer } from "@/components/tool-renderer";

export default function Page() {
  return (
    <main className="h-full">
      <div className="h-full">
        <CopilotChat className="h-full" />
      </div>
      <ToolRenderer />
    </main>
  );
}
