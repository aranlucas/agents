"use client";

import { use, type ReactNode } from "react";
import { CopilotKit } from "@copilotkit/react-core/v2";

export default function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ thread: string }>;
}) {
  const { thread } = use(params);
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit-excalidraw"
      agent="excalidraw"
      threadId={thread}
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      {children}
    </CopilotKit>
  );
}
