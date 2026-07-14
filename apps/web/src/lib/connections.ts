/** Minimal shape of a Clerk `ExternalAccount` this module depends on. */
export type ExternalAccountLike = {
  provider: string;
  verification?: { status?: string | null } | null;
};

const KROGER_CLERK_PROVIDERS = new Set(["oauth_custom_shopping", "custom_shopping"]);

export function hasKrogerConnection(accounts: readonly ExternalAccountLike[]): boolean {
  return accounts.some(
    (account) =>
      KROGER_CLERK_PROVIDERS.has(account.provider) && account.verification?.status === "verified",
  );
}
