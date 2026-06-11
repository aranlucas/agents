export function agentBaseUrl(url: string) {
  return url.replace(/\/+$/, "").replace(/\/agui$/, "");
}

export function agentAguiUrl(url: string) {
  return `${agentBaseUrl(url)}/agui`;
}

export function agentHealthUrl(url: string) {
  return `${agentBaseUrl(url)}/health`;
}
