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

export function selectArtifact(
  state: StateBag | undefined | null,
  config: AgentConfig,
): ArtifactView | null {
  if (!state || !config.artifact) return null;
  const content = toContent(state[config.artifact.stateField]);
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
