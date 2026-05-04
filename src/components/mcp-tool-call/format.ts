export function formatPayload(content: unknown): string {
  const text =
    typeof content === "object" ? JSON.stringify(content, null, 2) : String(content);
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export function formatScalar(value: unknown): string {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(formatScalar).join(", ");
  return JSON.stringify(value);
}

export function formatMoney(value: unknown, currency: string): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return formatScalar(value);
  return `${currency ? `${currency} ` : ""}${amount.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export function humanizeToolName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function humanizeKey(value: string): string {
  return value.replace(/_/g, " ");
}
