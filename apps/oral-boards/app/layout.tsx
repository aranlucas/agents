import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pediatric Dentistry Oral Boards Study App",
  description: "Study cases for pediatric dentistry oral board examinations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
