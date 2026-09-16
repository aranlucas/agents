export function agentBaseUrl(url: string) {
  return url.replace(/\/+$/, "").replace(/\/agui$/, "");
}
