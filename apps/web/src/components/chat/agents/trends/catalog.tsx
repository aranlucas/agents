"use client";

import { useState } from "react";
import {
  createCatalog,
  type CatalogDefinitions,
  type CatalogRenderers,
} from "@copilotkit/a2ui-renderer";
import { buildLinePoints, formatTrendValue, selectBarRows } from "./catalog-data";
import {
  TRENDS_CATALOG_ID,
  trendsCatalogDefinitions,
  type TrendRow,
  type TrendValueFormat,
} from "./catalog-schema";

type MetricProps = { label: string; value: string | number; detail?: string };
type BarChartProps = {
  title: string;
  description?: string;
  categoryKey: string;
  valueKey: string;
  rows: TrendRow[];
  maxItems: number;
  valueFormat: TrendValueFormat;
};
type LineChartProps = {
  title: string;
  description?: string;
  xKey: string;
  yKey: string;
  rows: TrendRow[];
  valueFormat: TrendValueFormat;
};
type TableProps = {
  title?: string;
  columns: { key: string; label: string; format: TrendValueFormat }[];
  rows: TrendRow[];
  maxRows: number;
};
type SqlProps = { title: string; sql: string };

export function TrendMetricRenderer({ props }: { props: MetricProps }) {
  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {props.label}
      </p>
      <p className="text-foreground mt-1 text-2xl font-semibold">{props.value}</p>
      {props.detail ? <p className="text-muted-foreground mt-1 text-xs">{props.detail}</p> : null}
    </section>
  );
}

export function TrendBarChartRenderer({ props }: { props: BarChartProps }) {
  const rows = selectBarRows(props.rows ?? [], props.categoryKey, props.valueKey, props.maxItems);
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <h3 className="text-foreground font-semibold">{props.title}</h3>
      {props.description ? (
        <p className="text-muted-foreground mt-1 text-sm">{props.description}</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">No numeric category data.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div
              key={`${row.label}:${row.value}`}
              className="grid grid-cols-[minmax(5rem,1fr)_3fr_auto] items-center gap-3"
            >
              <span className="truncate text-sm">{row.label}</span>
              <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-(--trends)"
                  style={{ width: `${Math.max(2, (Math.abs(row.value) / max) * 100)}%` }}
                />
              </div>
              <span className="text-muted-foreground font-mono text-xs">
                {formatTrendValue(row.value, props.valueFormat)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function TrendLineChartRenderer({ props }: { props: LineChartProps }) {
  const points = buildLinePoints(props.rows ?? [], props.xKey, props.yKey);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <h3 className="text-foreground font-semibold">{props.title}</h3>
      {props.description ? (
        <p className="text-muted-foreground mt-1 text-sm">{props.description}</p>
      ) : null}
      {points.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">No numeric time-series data.</p>
      ) : (
        <>
          <svg
            aria-label={props.title}
            className="mt-4 h-48 w-full overflow-visible"
            role="img"
            viewBox="0 0 100 100"
          >
            <path
              d={path}
              fill="none"
              stroke="var(--trends)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((point) => (
              <circle
                key={`${point.label}:${point.value}`}
                cx={point.x}
                cy={point.y}
                fill="var(--trends)"
                r="1.5"
              >
                <title>{`${point.label}: ${formatTrendValue(point.value, props.valueFormat)}`}</title>
              </circle>
            ))}
          </svg>
          <div className="text-muted-foreground mt-2 flex justify-between text-xs">
            <span>{points[0]?.label}</span>
            <span>{points.at(-1)?.label}</span>
          </div>
        </>
      )}
    </section>
  );
}

export function TrendTableRenderer({ props }: { props: TableProps }) {
  return (
    <section className="border-border bg-card rounded-xl border p-4">
      {props.title ? <h3 className="text-foreground mb-3 font-semibold">{props.title}</h3> : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-border border-b">
              {(props.columns ?? []).map((column) => (
                <th key={column.key} className="px-3 py-2 text-left font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(props.rows ?? []).slice(0, props.maxRows).map((row, index) => (
              <tr
                key={String(row[props.columns[0]?.key] ?? index)}
                className="border-border border-b last:border-0"
              >
                {props.columns.map((column) => (
                  <td key={column.key} className="px-3 py-2">
                    {formatTrendValue(row[column.key], column.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SqlDisclosureRenderer({ props }: { props: SqlProps }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="border-border bg-muted/30 rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">{props.title}</summary>
      <div className="mt-3 flex justify-end">
        <button
          className="border-border rounded-md border px-2 py-1 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(props.sql).then(() => setCopied(true));
          }}
          type="button"
        >
          {copied ? "Copied" : "Copy SQL"}
        </button>
      </div>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-black/90 p-3 text-xs text-white">
        <code>{props.sql}</code>
      </pre>
    </details>
  );
}

// Build the catalog, widening across the zod 3/4 version boundary that ships
// in @copilotkit/a2ui-renderer's type exports (compiled against zod ^3) versus
// this app's zod 4 runtime schemas. The `as unknown as` casts preserve the
// exported shipping types (CatalogDefinitions / CatalogRenderers) at the seam
// instead of erasing them.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const definitions = trendsCatalogDefinitions as unknown as CatalogDefinitions;
/* oxlint-disable typescript/no-unsafe-type-assertion */
const renderers = {
  TrendMetric: TrendMetricRenderer,
  TrendBarChart: TrendBarChartRenderer,
  TrendLineChart: TrendLineChartRenderer,
  TrendTable: TrendTableRenderer,
  SqlDisclosure: SqlDisclosureRenderer,
} as unknown as CatalogRenderers<CatalogDefinitions>;
/* oxlint-enable typescript/no-unsafe-type-assertion */

export const trendsCatalog = createCatalog(definitions, renderers, {
  catalogId: TRENDS_CATALOG_ID,
  includeBasicCatalog: true,
});
