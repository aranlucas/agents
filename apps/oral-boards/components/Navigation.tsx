"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Today's Case" },
  { href: "/study-plan", label: "Study Plan" },
  { href: "/all-cases", label: "All Cases" },
  { href: "/exam-framework", label: "Exam Framework" },
  { href: "/resources", label: "Resources" },
  { href: "/search", label: "Search Docs" },
] as const;

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-6 sm:mb-8">
      {navItems.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Button
            key={item.href}
            asChild
            variant={isActive ? "default" : "outline"}
            className={
              isActive
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950"
            }
          >
            <Link href={item.href}>{item.label}</Link>
          </Button>
        );
      })}
    </nav>
  );
}
