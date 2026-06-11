export type ProviderId = "strava" | "kroger";

/** Minimal shape of a Clerk `ExternalAccount` this module depends on. */
export type ExternalAccountLike = {
  provider: string;
  verification?: { status?: string | null } | null;
};

export const PROVIDERS: Record<
  ProviderId,
  {
    id: ProviderId;
    label: string;
    /** Clerk `externalAccount.provider` strings that map to this provider. */
    clerkProviders: readonly string[];
  }
> = {
  strava: {
    id: "strava",
    label: "Strava",
    clerkProviders: ["custom_strava", "oauth_custom_strava"],
  },
  kroger: {
    id: "kroger",
    label: "Kroger",
    clerkProviders: ["custom_shopping", "oauth_custom_shopping"],
  },
};

const PROVIDER_IDS: ProviderId[] = ["strava", "kroger"];

/** Provider ids that have a verified external account. */
export function connectedProviders(accounts: readonly ExternalAccountLike[]): ProviderId[] {
  return PROVIDER_IDS.filter((id) =>
    accounts.some(
      (account) =>
        PROVIDERS[id].clerkProviders.includes(account.provider) &&
        account.verification?.status === "verified",
    ),
  );
}

/** Required providers that are not connected. Order follows `required`. */
export function missingProviders(
  required: readonly ProviderId[],
  accounts: readonly ExternalAccountLike[],
): ProviderId[] {
  const connected = new Set(connectedProviders(accounts));
  return required.filter((id) => !connected.has(id));
}
