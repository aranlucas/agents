import { z } from "zod";

export const TRENDS_CATALOG_ID = "copilotkit://trends/v1";

const trendCell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const trendRow = z.record(z.string(), trendCell);
const valueFormat = z.enum(["text", "number", "percent", "date"]).default("text");

export const trendsCatalogDefinitions = {
  TrendMetric: {
    description: "A compact KPI card for a value derived from Trends rows.",
    props: z.object({
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      detail: z.string().optional(),
    }),
  },
  TrendBarChart: {
    description: "A ranked categorical bar chart using numeric values from rows.",
    props: z.object({
      title: z.string(),
      description: z.string().optional(),
      categoryKey: z.string(),
      valueKey: z.string(),
      rows: z.array(trendRow),
      maxItems: z.number().int().min(1).max(20).default(10),
      valueFormat,
    }),
  },
  TrendLineChart: {
    description: "A lightweight time-series line chart using values from rows.",
    props: z.object({
      title: z.string(),
      description: z.string().optional(),
      xKey: z.string(),
      yKey: z.string(),
      rows: z.array(trendRow),
      valueFormat,
    }),
  },
  TrendTable: {
    description: "An accessible bounded table containing the source Trends rows.",
    props: z.object({
      title: z.string().optional(),
      columns: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          format: valueFormat,
        }),
      ),
      rows: z.array(trendRow),
      maxRows: z.number().int().min(1).max(100).default(25),
    }),
  },
  SqlDisclosure: {
    description: "A collapsed disclosure containing generated BigQuery SQL.",
    props: z.object({
      title: z.string().default("Generated SQL"),
      sql: z.string(),
    }),
  },
};

export type TrendRow = z.infer<typeof trendRow>;
export type TrendValueFormat = z.infer<typeof valueFormat>;
