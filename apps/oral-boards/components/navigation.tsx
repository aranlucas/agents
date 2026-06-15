"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@agents/ui";
import { env } from "@/src/env";

const navItems = [
  { href: "/", label: "Today's Case" },
  { href: "/study-plan", label: "Study Plan" },
  { href: "/all-cases", label: "All Cases" },
  { href: "/exam-framework", label: "Exam Framework" },
  { href: "/resources", label: "Resources" },
  { href: "/search", label: "Search Docs" },
] as const;

const examinerLink = env.NEXT_PUBLIC_AGENT_CONSOLE_URL
  ? [{ href: env.NEXT_PUBLIC_AGENT_CONSOLE_URL, label: "Examiner", external: true }]
  : [];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap justify-center gap-2 sm:mb-8 sm:gap-3">
      {navItems.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={buttonVariants({
              variant: isActive ? "default" : "outline",
              className: isActive
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950",
            })}
          >
            {item.label}
          </Link>
        );
      })}
      {examinerLink.map((item) => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({
            variant: "outline",
            className:
              "border-indigo-600 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950",
          })}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
