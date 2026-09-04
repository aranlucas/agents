import type { ArtifactKind } from "@agents/types";
import type { AgentConfig } from "./agents/registry";

export type ArtifactView = {
  title: string;
  kind: ArtifactKind;
  content: string;
  status: string;
  version: number;
};

function isStateBag(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toContent(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(String).join("\n");
  return typeof raw === "string" ? raw : "";
}

export function selectArtifact(state: unknown, config: AgentConfig): ArtifactView | null {
  if (!isStateBag(state) || !config.artifact) return null;
  const content = toContent(state[config.artifact.stateField]);
  if (!content.trim()) return null;
  const ref = state.artifact;
  const refStatus = isStateBag(ref) ? ref.status : undefined;
  const refVersion = isStateBag(ref) ? ref.version : undefined;
  return {
    title: config.artifact.title,
    kind: config.artifact.kind,
    content,
    status:
      typeof refStatus === "string"
        ? refStatus
        : typeof state.status === "string"
          ? state.status
          : "drafting",
    version: typeof refVersion === "number" ? refVersion : 1,
  };
}
