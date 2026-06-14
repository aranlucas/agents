"use client";
import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeMode) => void;
};

const THEME_STORAGE_KEY = "agents-ui-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme() {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const initialTheme = readStoredTheme();
    const initialResolved = initialTheme === "system" ? getSystemTheme() : initialTheme;
    setThemeState(initialTheme);
    setResolvedTheme(initialResolved);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(initialResolved);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const nextResolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      setResolvedTheme(nextResolved);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(nextResolved);
      document.documentElement.style.colorScheme = nextResolved;
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (nextTheme) => {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        setThemeState(nextTheme);
      },
    }),
    [resolvedTheme, theme],
  );

  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      <QueryClientProvider client={queryClient}>
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within Providers");
  }
  return context;
}
