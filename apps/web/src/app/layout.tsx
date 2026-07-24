import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/providers";
import "@agents/ui/globals.css";
import "./globals.css";
import type { ReactNode } from "react";

// Schibsted Grotesk carries the voice; JetBrains Mono labels agent machinery
// (run status, wiring, session ids). globals.css binds both to --font-sans /
// --font-mono so every existing token consumer picks them up.
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-schibsted-grotesk",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Shrink the layout viewport when the mobile keyboard opens so pinned
  // composers (e.g. the oral-boards answer box) stay above the keyboard.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: {
    default: "Lucas Arango — Software Engineer",
    template: "%s | Lucas Arango",
  },
  description:
    "Software engineer building conversational AI products, personal agents, and useful tools.",
  metadataBase: new URL("https://agents-lucas.vercel.app"),
  openGraph: {
    title: "Lucas Arango — Software Engineer",
    description: "Software engineer building conversational AI products and personal agents.",
    type: "website",
    url: "/",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
