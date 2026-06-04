"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/providers";

const NEXT_THEME = {
  system: "light",
  light: "dark",
  dark: "system",
} as const;

const LABEL = {
  system: "Use light theme",
  light: "Use dark theme",
  dark: "Use system theme",
} as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={LABEL[theme]}
      title={`Theme: ${theme}`}
      onClick={() => setTheme(NEXT_THEME[theme])}
      className="border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink-soft)] shadow-none hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
