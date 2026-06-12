const PUBLIC_AGENT_IDS = new Set(["resume"]);

export function isPublicCopilotPath(pathname: string): boolean {
  if (pathname === "/api/copilotkit/info") return true;
  const match = /^\/api\/copilotkit\/agent\/([^/]+)\//.exec(pathname);
  return match !== null && PUBLIC_AGENT_IDS.has(match[1]);
}
