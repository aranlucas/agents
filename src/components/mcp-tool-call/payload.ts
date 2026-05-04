import type { JsonRecord } from "./types";

export function unwrapResult(value: unknown): unknown {
  const parsed = parseJsonString(value);
  const record = toRecord(parsed);

  if (Array.isArray(parsed)) return parsed;
  if (!record) return parsed;

  const structured = record.structuredContent;
  if (structured != null) return unwrapResult(structured);

  const content = record.content;
  if (Array.isArray(content)) {
    const firstText = content.find((item) => toRecord(item)?.type === "text");
    const text = toRecord(firstText)?.text;
    if (typeof text === "string") return unwrapResult(text);
  }

  if (record.result != null && Object.keys(record).length <= 3) {
    return unwrapResult(record.result);
  }

  return record;
}

export function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function toRecord(value: unknown): JsonRecord | null {
  const parsed = parseJsonString(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JsonRecord)
    : null;
}

export function getError(value: unknown): string | null {
  const record = toRecord(value);
  if (!record) return null;
  if (record.success === false && typeof record.error === "string") return record.error;
  if (typeof record.error === "string") return record.error;
  return null;
}
