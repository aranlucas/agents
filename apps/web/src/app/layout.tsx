import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "@agents/ui/globals.css";
import "./globals.css";
import type { ReactNode } from "react";

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
    "A personal index of ideas and working demos for specialist agents, typed state, real tools, and durable artifacts.",
  metadataBase: new URL("https://agents-lucas.vercel.app"),
  openGraph: {
    title: "Lucas Arango — Software Engineer",
    description:
      "Ideas and working experiments for agents that coordinate, use tools, and create durable artifacts.",
    type: "website",
    url: "/",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
