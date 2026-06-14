import type { OralBoardsPhase } from "@agents/types";

export type OralBoardsTab = "question" | "feedback";

export function tabForStatus(status: OralBoardsPhase | "idle" | undefined): OralBoardsTab {
  return status === "feedback" || status === "complete" ? "feedback" : "question";
}
