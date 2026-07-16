import type { Metadata } from "next";
import type { ReactNode } from "react";

import { GroceryFooter, GroceryHeader } from "@/components/grocery/grocery-chrome";

export const metadata: Metadata = {
  title: {
    default: "Grocery Agent — meal ideas to a list you control",
    template: "%s | Grocery Agent",
  },
  description:
    "Turn a recipe, photo, or weeknight idea into a practical grocery list, with optional live Kroger products, deals, and cart actions.",
  openGraph: {
    title: "Grocery Agent — meal ideas to a list you control",
    description:
      "Plan dinner, build a practical grocery list, and review every item before a Kroger cart action.",
    type: "website",
    url: "/grocery",
  },
};

export default function GroceryLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-card text-foreground">
      <GroceryHeader />
      {children}
      <GroceryFooter />
    </div>
  );
}
