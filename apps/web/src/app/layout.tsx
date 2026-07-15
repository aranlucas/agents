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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
