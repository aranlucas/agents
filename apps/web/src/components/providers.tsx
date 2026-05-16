"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";
import { ClerkProvider } from "@clerk/nextjs";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        useSingleEndpoint={false}
        enableInspector={process.env.NODE_ENV !== "production"}
      >
        {children}
      </CopilotKit>
    </ClerkProvider>
  );
}
