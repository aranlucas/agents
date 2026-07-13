"use client";

import type { TrendsRow, TrendsStatus } from "@agents/types";
import {
  Artifact,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
  Badge,
  Streamdown,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agents/ui";
import { BarChart3, Database, Search, Sparkles } from "lucide-react";

import { toTrendsState } from "@/lib/agent-state";

import type { AgentArtifactProps } from "./extensions";

const STATUS_META: Record<TrendsStatus, { label: string; className: string }> = {
  idle: {
    label: "Waiting",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  querying: {
    label: "Querying",
    className:
      "border-[color-mix(in_srgb,var(--page-color)_35%,transparent)] bg-[color-mix(in_srgb,var(--page-color)_10%,transparent)] text-[var(--page-color)]",
  },
  ready: {
    label: "Ready",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  empty: {
    label: "No results",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
  error: {
    label: "Error",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

type Metric = { key: string; label: string; suffix: string; inverse?: boolean };

const METRICS = [
  { key: "average_dma_percent_gain", label: "Average DMA gain", suffix: "%" },
  { key: "percent_gain", label: "Percent gain", suffix: "%" },
  { key: "dma_count", label: "DMA reach", suffix: " markets" },
  { key: "average_dma_score", label: "Average DMA score", suffix: "" },
  { key: "score", label: "Interest score", suffix: "" },
  { key: "average_dma_rank", label: "Average DMA rank", suffix: "", inverse: true },
  { key: "rank", label: "Rank", suffix: "", inverse: true },
] as const satisfies readonly Metric[];

const LABEL_COLUMNS = ["term", "query", "topic", "keyword", "name"] as const;
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

type ChartItem = { label: string; value: number; barValue: number };

function numericCell(row: TrendsRow, key: string): number | undefined {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringCell(row: TrendsRow, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function inferColumns(columns: string[], rows: TrendsRow[]) {
  if (columns.length) return columns;
  return rows[0] ? Object.keys(rows[0]) : [];
}

function selectMetric(rows: TrendsRow[]): Metric | undefined {
  return METRICS.find((metric) => rows.some((row) => numericCell(row, metric.key) !== undefined));
}

function selectLabelColumn(columns: string[], rows: TrendsRow[]) {
  return (
    LABEL_COLUMNS.find((column) => rows.some((row) => stringCell(row, column))) ??
    columns.find((column) => rows.some((row) => stringCell(row, column)))
  );
}

function buildChartData(rows: TrendsRow[], labelColumn: string, metric: Metric): ChartItem[] {
  const items: Array<{ label: string; value: number }> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const label = stringCell(row, labelColumn);
    const value = numericCell(row, metric.key);
    if (!label || value === undefined || seen.has(label)) continue;
    seen.add(label);
    items.push({ label, value });
    if (items.length === 10) break;
  }

  if (!items.length) return [];
  if (metric.inverse) {
    const max = Math.max(...items.map((item) => item.value));
    return items.map((item) => ({ ...item, barValue: max - item.value + 1 }));
  }
  return items.map((item) => ({ ...item, barValue: Math.max(item.value, 0) }));
}

function formatMetric(value: number, metric: Metric) {
  if (metric.key === "rank") return `#${numberFormatter.format(value)}`;
  return `${numberFormatter.format(value)}${metric.suffix}`;
}

function formatCell(value: TrendsRow[string]) {
  if (typeof value === "number") return numberFormatter.format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value ?? "—";
}

function keyedRows(rows: TrendsRow[], columns: string[]) {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const valueKey = columns.map((column) => String(row[column] ?? "")).join("\u001f");
    const count = counts.get(valueKey) ?? 0;
    counts.set(valueKey, count + 1);
    return { row, key: count === 0 ? valueKey : `${valueKey}\u001f${count}` };
  });
}

function ComparisonChart({ rows, columns }: { rows: TrendsRow[]; columns: string[] }) {
  const metric = selectMetric(rows);
  const labelColumn = selectLabelColumn(columns, rows);
  if (!metric || !labelColumn) return null;

  const data = buildChartData(rows, labelColumn, metric);
  if (!data.length) return null;
  const maxBarValue = Math.max(...data.map((item) => item.barValue), 1);

  return (
    <section aria-labelledby="trends-comparison">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-4 text-[var(--page-color)]" />
            <h3 id="trends-comparison" className="text-sm font-semibold">
              Comparison
            </h3>
          </div>
          <p className="text-muted-foreground text-xs">{metric.label}</p>
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">Top {data.length}</span>
      </div>

      <div className="space-y-3" role="img" aria-label={`${metric.label} by ${labelColumn}`}>
        {data.map((item, index) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex items-baseline gap-2 text-sm">
                <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                  {index + 1}
                </span>
                <span className="truncate font-medium" title={item.label}>
                  {item.label}
                </span>
              </div>
              <div className="bg-muted ml-7 h-2 overflow-hidden rounded-full">
                <div
                  className="h-full min-w-1 rounded-full bg-[var(--page-color)] transition-[width] duration-500 motion-reduce:transition-none"
                  data-testid="trends-chart-bar"
                  style={{ width: `${Math.max((item.barValue / maxBarValue) * 100, 2)}%` }}
                />
              </div>
            </div>
            <span className="pt-0.5 text-right text-sm font-semibold tabular-nums">
              {formatMetric(item.value, metric)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrendsArtifact({ state: rawState, view, onClose }: AgentArtifactProps) {
  const state = toTrendsState(rawState);
  const status = state.status ?? "idle";
  const statusMeta = STATUS_META[status];
  const rows = state.rows ?? [];
  const columns = inferColumns(state.columns ?? [], rows);
  const tableRows = keyedRows(rows, columns);
  const question = state.query?.trim() ? state.query.trim() : view.content;

  return (
    <Artifact className="h-full rounded-none border-0 border-l" data-testid="trends-artifact">
      <ArtifactHeader className="items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ArtifactTitle>{view.title}</ArtifactTitle>
            <Badge variant="outline" className={statusMeta.className}>
              {statusMeta.label}
            </Badge>
          </div>
          <ArtifactDescription className="mt-1">
            {rows.length ? `${rows.length} rows · live agent state` : "Live agent state"}
          </ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactClose aria-label="Close Trends analysis" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0">
        <section className="border-b bg-[color-mix(in_srgb,var(--page-color)_7%,transparent)] px-5 py-5">
          <div className="mb-2 flex items-center gap-2 text-[var(--page-color)]">
            <Search aria-hidden="true" className="size-4" />
            <p className="text-xs font-semibold tracking-[0.16em] uppercase">Question</p>
          </div>
          <h2 className="text-lg leading-snug font-semibold">{question}</h2>
        </section>

        <div className="space-y-8 p-5">
          {state.error?.trim() ? (
            <p className="border-destructive/25 bg-destructive/5 text-destructive rounded-md border px-3 py-3 text-sm">
              {state.error}
            </p>
          ) : null}

          <ComparisonChart rows={rows} columns={columns} />

          {state.insights?.trim() ? (
            <section aria-labelledby="trends-insights">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles aria-hidden="true" className="size-4 text-[var(--page-color)]" />
                <h3 id="trends-insights" className="text-sm font-semibold">
                  Insights
                </h3>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Streamdown>{state.insights}</Streamdown>
              </div>
            </section>
          ) : null}

          {rows.length && columns.length ? (
            <section aria-labelledby="trends-data">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database aria-hidden="true" className="size-4 text-[var(--page-color)]" />
                  <h3 id="trends-data" className="text-sm font-semibold">
                    Result data
                  </h3>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {rows.length} rows
                </span>
              </div>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/35 hover:bg-muted/35">
                      {columns.map((column) => (
                        <TableHead key={column} className="text-xs">
                          {column.replaceAll("_", " ")}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableRows.map(({ row, key }) => (
                      <TableRow key={key}>
                        {columns.map((column) => (
                          <TableCell key={column} className="max-w-64 truncate text-xs">
                            {formatCell(row[column])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}

          {state.generated_sql?.trim() ? (
            <details className="group border-t pt-4">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold tracking-wide uppercase transition-colors">
                Generated SQL
              </summary>
              <pre className="bg-muted/45 mt-3 overflow-x-auto rounded-md border p-3 text-xs leading-relaxed">
                <code>{state.generated_sql}</code>
              </pre>
            </details>
          ) : null}
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
