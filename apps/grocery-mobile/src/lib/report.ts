export type ReportCategory = "Wrong item" | "Connection issue" | "App problem" | "Other";

export function buildReportMailto({
  category,
  details,
  userId,
}: {
  category: ReportCategory;
  details: string;
  userId?: string | null;
}): string {
  const subject = `Grocery Agent report: ${category}`;
  const body = [
    `Category: ${category}`,
    `Details: ${details.trim() || "No additional details"}`,
    `User reference: ${userId ?? "Unavailable"}`,
    "",
    "Please do not include passwords, payment details, or other sensitive information.",
  ].join("\n");
  return `mailto:aranlucas@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
