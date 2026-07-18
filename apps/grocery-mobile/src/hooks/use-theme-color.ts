import { useCSSVariable } from "uniwind";

export function useThemeColor(variable: `--color-${string}`, fallback: string): string {
  const value = useCSSVariable(variable);
  return typeof value === "string" ? value : fallback;
}
