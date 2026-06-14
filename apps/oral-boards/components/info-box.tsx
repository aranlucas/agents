import { ReactNode } from "react";
import { cn } from "@agents/ui";

type InfoBoxVariant = "blue" | "indigo" | "green" | "yellow" | "red" | "gray";

interface InfoBoxProps {
  children: ReactNode;
  variant?: InfoBoxVariant;
  className?: string;
}

const variantStyles: Record<InfoBoxVariant, string> = {
  blue: "bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900",
  indigo: "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900",
  green: "bg-green-50/50 dark:bg-green-950/20 border-green-100 dark:border-green-900",
  yellow: "bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-100 dark:border-yellow-900",
  red: "bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900",
  gray: "bg-gray-50/50 dark:bg-gray-950/20 border-gray-100 dark:border-gray-900",
};

export function InfoBox({ children, variant = "blue", className }: InfoBoxProps) {
  return (
    <section className={cn("rounded-lg border p-4 sm:p-6", variantStyles[variant], className)}>
      {children}
    </section>
  );
}
