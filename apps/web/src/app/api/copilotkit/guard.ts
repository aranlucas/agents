import { isOfflineAgentTestMode } from "@/lib/offline-mode";

const PUBLIC_AGENT_IDS = new Set(["resume"]);

export function isPublicCopilotPath(pathname: string): boolean {
  if (isOfflineAgentTestMode()) return true;
  if (pathname === "/api/copilotkit/info") return true;
  if (pathname === "/api/copilotkit/transcribe") return true;
  const match = /^\/api\/copilotkit\/agent\/([^/]+)\//.exec(pathname);
  return match !== null && PUBLIC_AGENT_IDS.has(match[1]);
}
