import type { ArtifactKind } from "@agents/types";
import type { AgentConfig } from "./agents/registry";

export type ArtifactView = {
  title: string;
  kind: ArtifactKind;
  content: string;
  status: string;
  version: number;
};

type StateBag = Record<string, unknown> & {
  status?: unknown;
  artifact?: { version?: number; status?: string } | undefined;
};

function toContent(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(String).join("\n");
  return typeof raw === "string" ? raw : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function renderSource(value: unknown): string {
  if (!isRecord(value)) return "";
  const title = typeof value.title === "string" ? value.title : "Untitled source";
  const collection = typeof value.collection === "string" ? value.collection : "source";
  const docid = typeof value.docid === "number" ? ` #${value.docid}` : "";
  return `- ${title} (${collection}${docid})`;
}

function renderOralBoardsContent(state: StateBag): string {
  const sections: string[] = [];
  const caseBody = toContent(state.case);
  if (caseBody.trim()) sections.push(caseBody);

  if (Array.isArray(state.case_sources) && state.case_sources.length > 0) {
    const sources = state.case_sources.map(renderSource).filter(Boolean).join("\n");
    if (sources) sections.push(`## Sources\n${sources}`);
  }

  if (Array.isArray(state.transcript) && state.transcript.length > 0) {
    const transcript = state.transcript
      .filter(isRecord)
      .map((exchange, index) => {
        const question = toContent(exchange.question);
        const answer = toContent(exchange.answer);
        const feedback = toContent(exchange.feedback);
        const citations = Array.isArray(exchange.citations)
          ? exchange.citations.map(renderSource).filter(Boolean).join("\n")
          : "";
        return [
          `### Exchange ${index + 1}`,
          question ? `**Question:** ${question}` : "",
          answer ? `**Answer:** ${answer}` : "",
          feedback ? `**Feedback:** ${feedback}` : "",
          citations ? `**Citations**\n${citations}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      })
      .filter(Boolean)
      .join("\n\n");
    if (transcript) sections.push(`## Transcript\n${transcript}`);
  }

  const scoreCard = toContent(state.score_card);
  if (scoreCard.trim()) sections.push(scoreCard);

  return sections.join("\n\n");
}

export function selectArtifact(
  state: StateBag | undefined | null,
  config: AgentConfig,
): ArtifactView | null {
  if (!state || !config.artifact) return null;
  const content =
    config.id === "oral-boards"
      ? renderOralBoardsContent(state)
      : toContent(state[config.artifact.stateField]);
  if (!content.trim()) return null;
  const ref = state.artifact;
  return {
    title: config.artifact.title,
    kind: config.artifact.kind,
    content,
    status: ref?.status ?? (typeof state.status === "string" ? state.status : "drafting"),
    version: ref?.version ?? 1,
  };
}
