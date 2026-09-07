"use client";
import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { TooltipProvider } from "@agents/ui/components/tooltip";

/**
 * Clerk renders its own island and cannot read our Tailwind theme, so the
 * palette is mirrored here from the tokens in `packages/ui/src/styles/globals.css`.
 * Clerk derives its own shade ramps from these, which rules out passing
 * `var(--token)` through. Keep the two in sync when the theme changes.
 */
const clerkPalette = {
  light: {
    colorBackground: "#fffefa",
    colorForeground: "#15140f",
    colorMutedForeground: "#6f6b5e",
    colorPrimary: "#275f87",
    colorPrimaryForeground: "#ffffff",
    colorInput: "#fffefa",
    colorInputForeground: "#15140f",
    colorBorder: "#d9d6ca",
    colorNeutral: "#15140f",
    colorDanger: "#b42318",
    colorSuccess: "#0f7a45",
    colorWarning: "#a15c00",
  },
  dark: {
    colorBackground: "#1d1f19",
    colorForeground: "#f3f1e8",
    colorMutedForeground: "#a5a091",
    colorPrimary: "#8fc7e6",
    colorPrimaryForeground: "#11120f",
    colorInput: "#24261f",
    colorInputForeground: "#f3f1e8",
    colorBorder: "#3c3e34",
    colorNeutral: "#f3f1e8",
    colorDanger: "#ff9a91",
    colorSuccess: "#79d99d",
    colorWarning: "#f2c56d",
  },
} as const;

function ThemedClerkProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const palette = resolvedTheme === "dark" ? clerkPalette.dark : clerkPalette.light;

  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          ...palette,
          fontFamily: "var(--font-sans)",
          fontFamilyButtons: "var(--font-sans)",
          borderRadius: "0.5rem",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <ThemedClerkProvider>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </ThemedClerkProvider>
      </NextThemesProvider>
    </QueryClientProvider>
  );
}
