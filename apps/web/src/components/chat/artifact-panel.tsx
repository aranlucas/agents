"use client";

import { Streamdown } from "streamdown";

import {
  Artifact,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import type { ArtifactView } from "./artifact";

export function ArtifactPanel({ view, onClose }: { view: ArtifactView; onClose: () => void }) {
  return (
    <Artifact className="h-full rounded-none border-0 border-l">
      <ArtifactHeader>
        <div className="min-w-0">
          <ArtifactTitle>{view.title}</ArtifactTitle>
          <ArtifactDescription>{`v${view.version} · ${view.status}`}</ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactClose aria-label="Close artifact" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent>
        <Streamdown>{view.content}</Streamdown>
      </ArtifactContent>
    </Artifact>
  );
}
