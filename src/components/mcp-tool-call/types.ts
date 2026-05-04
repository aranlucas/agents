export type ToolStatus = "complete" | "inProgress" | "executing" | string;
export type JsonRecord = Record<string, unknown>;

export type ToolMeta = {
  label: string;
  category: string;
  tone: "sky" | "green" | "amber" | "rose" | "violet" | "slate";
};

export type ResultHighlight = {
  label: string;
  value: string;
};

export type ResultItem = {
  title: string;
  subtitle?: string;
  detail?: string;
  price?: string;
};
