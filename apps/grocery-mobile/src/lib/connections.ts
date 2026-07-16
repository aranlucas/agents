export type ExternalAccountLike = {
  provider: string;
  verification?: { status?: string | null } | null;
};

const KROGER_PROVIDERS = new Set(["oauth_custom_shopping", "custom_shopping"]);

export function isKrogerConnection(account: ExternalAccountLike): boolean {
  return KROGER_PROVIDERS.has(account.provider);
}

export function hasKrogerConnection(accounts: readonly ExternalAccountLike[]): boolean {
  return accounts.some(
    (account) => isKrogerConnection(account) && account.verification?.status === "verified",
  );
}

export function rotatingTokenNonceFromCallback(callbackUrl: string): string {
  return new URL(callbackUrl).searchParams.get("rotating_token_nonce") ?? "";
}
