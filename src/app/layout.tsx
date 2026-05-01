import type { Metadata } from "next";
import { Space_Mono, Cormorant_Garamond } from "next/font/google";
import { CopilotKit } from "@copilotkit/react-core/v2";
import "./globals.css";
import "@copilotkit/react-core/v2/styles.css";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  weight: ["300", "400", "600"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flight Search",
  description: "AI-powered flight search",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${spaceMono.variable} ${cormorant.variable}`}>
      <body className="antialiased">
        <CopilotKit runtimeUrl="/api/copilotkit" agent="my_agent" a2ui={{}}>
          {children}
        </CopilotKit>
      </body>
    </html>
  );
}
