import type {
  OralBoardsExchange,
  OralBoardsOutcome,
  OralBoardsSkill,
  OralBoardsSkillsetScore,
} from "@agents/types";

export type OralBoardsReport = {
  caseBody: string;
  scoreCard: string;
  scoreSummary: OralBoardsSkillsetScore[];
  outcome?: OralBoardsOutcome;
  transcript: OralBoardsExchange[];
};

export type OralBoardsExportFormat = "markdown" | "pdf";
export type OralBoardsExportResult = "shared" | "downloaded" | "cancelled";

const OUTCOME_LABELS: Record<OralBoardsOutcome, string> = {
  pass: "On track to pass",
  borderline: "Borderline",
  not_yet: "Not yet passing",
};

const SKILL_LABELS: Record<OralBoardsSkill, string> = {
  remember: "Remember",
  understand_apply: "Understand / Apply",
  analyze_evaluate: "Analyze / Evaluate",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteScore(value: unknown): number | undefined {
  if (value == null) return undefined;
  const score = Number(value);
  return Number.isFinite(score) ? score : undefined;
}

function reportDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function dateSlug(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function tableCell(value: unknown): string {
  return (
    text(value)
      .replaceAll("|", "\\|")
      .replace(/\s*\n\s*/g, " ") || "-"
  );
}

function isOralBoardsSkill(value: unknown): value is OralBoardsSkill {
  return value === "remember" || value === "understand_apply" || value === "analyze_evaluate";
}

function skillLabel(skill: unknown): string {
  return isOralBoardsSkill(skill) ? SKILL_LABELS[skill] : "-";
}

function outcomeLabel(outcome: OralBoardsOutcome | undefined): string | undefined {
  return outcome ? OUTCOME_LABELS[outcome] : undefined;
}

function addMarkdownField(parts: string[], heading: string, value: unknown): void {
  const content = text(value);
  if (!content) return;
  parts.push(`**${heading}**`, "", content, "");
}

export function buildOralBoardsMarkdown(
  report: OralBoardsReport,
  generatedAt = new Date(),
): string {
  const parts = ["# Oral Boards Practice Report", "", `Generated ${reportDate(generatedAt)}`, ""];
  const outcome = outcomeLabel(report.outcome);

  if (outcome) {
    parts.push("## Practice outcome", "", `**${outcome}**`, "");
    parts.push(
      "> Study estimate only. The real OCE is reported Pass/Fail and each skillset is scored independently by two examiners.",
      "",
    );
  }

  if (text(report.caseBody)) {
    parts.push("## Case vignette", "", text(report.caseBody), "");
  }

  if (report.scoreSummary.length > 0) {
    parts.push(
      "## Skillset scores",
      "",
      "| Skillset | Skill | Score | Rationale |",
      "| --- | --- | ---: | --- |",
    );
    for (const row of report.scoreSummary) {
      const score = finiteScore(row.score);
      parts.push(
        `| ${tableCell(row.skillset)} | ${skillLabel(row.skill)} | ${score == null ? "-" : `${score}/3`} | ${tableCell(row.rationale)} |`,
      );
    }
    parts.push("");
  }

  if (text(report.scoreCard)) {
    parts.push("## Examiner summary", "", text(report.scoreCard), "");
  }

  if (report.transcript.length > 0) {
    parts.push("## Question review", "");
    for (const [index, exchange] of report.transcript.entries()) {
      parts.push(`### Question ${index + 1}`, "");
      addMarkdownField(parts, "Examiner", exchange.question);
      addMarkdownField(parts, "Your answer", exchange.answer);

      const metadata = [
        text(exchange.skillset),
        skillLabel(exchange.skill) === "-" ? "" : skillLabel(exchange.skill),
        finiteScore(exchange.score) == null ? "" : `${finiteScore(exchange.score)}/3`,
      ].filter(Boolean);
      if (metadata.length > 0) parts.push(`**Assessment:** ${metadata.join(" - ")}`, "");

      addMarkdownField(parts, "Examiner feedback", exchange.feedback);
      addMarkdownField(parts, "Model answer", exchange.ideal_response);
    }
  }

  return `${parts.join("\n").trim()}\n`;
}

function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .trim();
}

function pdfText(value: unknown): string {
  const normalized = plainText(text(value))
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2192/g, "->")
    .replace(/\u00b0/g, " degrees ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  return Array.from(normalized, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return character === "\n" || character === "\t" || (code >= 32 && code <= 126)
      ? character
      : "?";
  }).join("");
}

export async function createOralBoardsPdf(
  report: OralBoardsReport,
  generatedAt = new Date(),
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - 18;
  let y = margin;

  const newPage = () => {
    doc.addPage();
    y = margin;
  };
  const ensureSpace = (height: number) => {
    if (y + height > bottom) newPage();
  };
  const write = (
    value: unknown,
    options: { size?: number; style?: "normal" | "bold"; color?: [number, number, number] } = {},
  ) => {
    const valueText = pdfText(value);
    if (!valueText) return;
    const size = options.size ?? 10;
    const lineHeight = size * 0.44;
    doc.setFont("helvetica", options.style ?? "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(options.color ?? [31, 41, 55]));
    const lines = doc.splitTextToSize(valueText, contentWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(String(line), margin, y);
      y += lineHeight;
    }
  };
  const gap = (height: number) => {
    ensureSpace(height);
    y += height;
  };
  const section = (title: string) => {
    ensureSpace(12);
    gap(3);
    write(title, { size: 13, style: "bold", color: [67, 56, 202] });
    gap(2);
  };
  const paragraph = (value: unknown) => {
    const valueText = pdfText(value);
    if (!valueText) return;
    for (const block of valueText.split(/\n\s*\n/)) {
      write(block, { size: 10 });
      gap(2);
    }
  };
  const field = (label: string, value: unknown) => {
    if (!text(value)) return;
    ensureSpace(10);
    write(label, { size: 9, style: "bold", color: [75, 85, 99] });
    paragraph(value);
  };

  doc.setProperties({
    title: "Oral Boards Practice Report",
    subject: "Oral boards practice case results",
    creator: "Agents",
  });
  write("Oral Boards Practice Report", { size: 20, style: "bold", color: [67, 56, 202] });
  gap(2);
  write(`Generated ${reportDate(generatedAt)}`, { size: 9, color: [107, 114, 128] });

  const outcome = outcomeLabel(report.outcome);
  if (outcome) {
    section("Practice outcome");
    write(outcome, { size: 12, style: "bold" });
    gap(2);
    paragraph(
      "Study estimate only. The real OCE is reported Pass/Fail and each skillset is scored independently by two examiners.",
    );
  }

  if (text(report.caseBody)) {
    section("Case vignette");
    paragraph(report.caseBody);
  }

  if (report.scoreSummary.length > 0) {
    section("Skillset scores");
    for (const row of report.scoreSummary) {
      const score = finiteScore(row.score);
      const metadata = [
        text(row.skillset) || "Unknown skillset",
        skillLabel(row.skill) === "-" ? "" : skillLabel(row.skill),
        score == null ? "" : `${score}/3`,
      ].filter(Boolean);
      ensureSpace(12);
      write(metadata.join(" - "), { size: 10, style: "bold" });
      if (text(row.rationale)) write(row.rationale, { size: 9, color: [75, 85, 99] });
      gap(3);
    }
  }

  if (text(report.scoreCard)) {
    section("Examiner summary");
    paragraph(report.scoreCard);
  }

  if (report.transcript.length > 0) {
    section("Question review");
    for (const [index, exchange] of report.transcript.entries()) {
      ensureSpace(18);
      write(`Question ${index + 1}`, { size: 11, style: "bold", color: [67, 56, 202] });
      gap(1);
      field("Examiner", exchange.question);
      field("Your answer", exchange.answer);

      const score = finiteScore(exchange.score);
      const metadata = [
        text(exchange.skillset),
        skillLabel(exchange.skill) === "-" ? "" : skillLabel(exchange.skill),
        score == null ? "" : `${score}/3`,
      ].filter(Boolean);
      if (metadata.length > 0) field("Assessment", metadata.join(" - "));

      field("Examiner feedback", exchange.feedback);
      field("Model answer", exchange.ideal_response);
      gap(3);
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Oral Boards Practice Report - Page ${page} of ${pageCount}`, margin, pageHeight - 7);
  }

  return doc.output("blob");
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function shareOrDownloadFile(file: File): Promise<OralBoardsExportResult> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: "Oral Boards Practice Report", files: [file] });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  downloadFile(file);
  return "downloaded";
}

export async function exportOralBoardsReport(
  format: OralBoardsExportFormat,
  report: OralBoardsReport,
  generatedAt = new Date(),
): Promise<OralBoardsExportResult> {
  const basename = `oral-boards-practice-${dateSlug(generatedAt)}`;
  const file =
    format === "pdf"
      ? new File([await createOralBoardsPdf(report, generatedAt)], `${basename}.pdf`, {
          type: "application/pdf",
        })
      : new File([buildOralBoardsMarkdown(report, generatedAt)], `${basename}.md`, {
          type: "text/markdown;charset=utf-8",
        });
  return shareOrDownloadFile(file);
}
