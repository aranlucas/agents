import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "@agents/ui/globals.css";
import "./globals.css";
import type { ReactNode } from "react";

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Shrink the layout viewport when the mobile keyboard opens so pinned
  // composers (e.g. the oral-boards answer box) stay above the keyboard.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Agents — AI planning network",
  description:
    "Trip, grocery, and fitness agents that collaborate — powered by Google ADK + CopilotKit.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${schibsted.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
