import type { TrendRow, TrendValueFormat } from "./catalog-schema";

export type BarDatum = { label: string; value: number };
export type LinePoint = {
  label: string;
  value: number;
  x: number;
  y: number;
};

export function selectBarRows(
  rows: TrendRow[],
  categoryKey: string,
  valueKey: string,
  maxItems: number,
): BarDatum[] {
  return rows
    .flatMap((row) => {
      const category = row[categoryKey];
      const value = row[valueKey];
      return typeof value === "number" && Number.isFinite(value)
        ? [{ label: String(category ?? "—"), value }]
        : [];
    })
    .slice(0, Math.max(1, Math.min(maxItems, 20)));
}

export function buildLinePoints(rows: TrendRow[], xKey: string, yKey: string): LinePoint[] {
  const values = rows.flatMap((row) => {
    const value = row[yKey];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ label: String(row[xKey] ?? "—"), value }]
      : [];
  });
  if (values.length === 0) return [];
  const min = Math.min(...values.map(({ value }) => value));
  const max = Math.max(...values.map(({ value }) => value));
  const span = max - min || 1;
  const xSpan = Math.max(values.length - 1, 1);
  return values.map(({ label, value }, index) => ({
    label,
    value,
    x: (index / xSpan) * 100,
    y: 100 - ((value - min) / span) * 100,
  }));
}

export function formatTrendValue(
  value: string | number | boolean | null | undefined,
  format: TrendValueFormat,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "number" && typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }
  if (format === "percent" && typeof value === "number") {
    return `${new Intl.NumberFormat("en-US").format(value)}%`;
  }
  if (format === "date" && typeof value === "string") {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.valueOf())
      ? value
      : new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(date);
  }
  return String(value);
}
