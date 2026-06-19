"use client";
import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TooltipProvider } from "@agents/ui";

const isOfflineAgentTestMode = process.env.NEXT_PUBLIC_AGENT_TEST_MODE === "offline";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  const content = (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider delay={200}>{children}</TooltipProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  );

  if (isOfflineAgentTestMode) {
    return content;
  }

  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      {content}
    </ClerkProvider>
  );
}
