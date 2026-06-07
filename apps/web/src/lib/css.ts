import type { CSSProperties } from "react";

/**
 * `CSSProperties` plus arbitrary CSS custom properties (`--foo`), which React's
 * built-in type omits. Intersecting with `CSSProperties` keeps the result
 * assignable to the `style` prop without an `as` cast.
 */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Identity helper that lets a style object declare CSS variables while staying
 * typed as `CSSProperties`. Use it instead of `{...} as React.CSSProperties`.
 */
export function cssVars(vars: CSSVars): CSSProperties {
  return vars;
}
