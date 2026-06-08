"use client";

import { Streamdown } from "streamdown";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";

import {
  Artifact,
  ArtifactActions,
  ArtifactAction,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import type { ArtifactView } from "./artifact";

export function ArtifactPanel({
  view,
  fullscreen,
  onClose,
  onToggleFullscreen,
}: {
  view: ArtifactView;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <Artifact className="h-full rounded-none border-0 border-l">
      <ArtifactHeader>
        <div className="min-w-0">
          <ArtifactTitle>{view.title}</ArtifactTitle>
          <ArtifactDescription>{`v${view.version} · ${view.status}`}</ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactAction
            icon={fullscreen ? Minimize2Icon : Maximize2Icon}
            tooltip={fullscreen ? "Restore split" : "Fullscreen"}
            onClick={onToggleFullscreen}
          />
          <ArtifactClose aria-label="Close artifact" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent>
        <Streamdown>{view.content}</Streamdown>
      </ArtifactContent>
    </Artifact>
  );
}
