import Constants from "expo-constants";

type AppExtra = {
  clerkPublishableKey?: unknown;
  copilotKitRuntimeUrl?: unknown;
  marketingBaseUrl?: unknown;
};

function requiredHttpUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is not configured.`);
  }
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error(`${label} must use HTTPS.`);
  }
  return parsed.toString().replace(/\/$/u, "");
}

function extra(): AppExtra {
  return Constants.expoConfig?.extra ?? {};
}

export function getClerkPublishableKey(): string {
  const value = extra().clerkPublishableKey;
  if (typeof value !== "string" || !value.startsWith("pk_")) {
    throw new Error("Clerk sign-in is not configured for this build.");
  }
  return value;
}

export function getRuntimeUrl(): string {
  return requiredHttpUrl(extra().copilotKitRuntimeUrl, "Grocery runtime");
}

export function getMarketingBaseUrl(): string {
  return requiredHttpUrl(extra().marketingBaseUrl, "Grocery website");
}

export function getWebsiteOrigin(): string {
  return new URL(getMarketingBaseUrl()).origin;
}

export function getLegalLinks() {
  const base = getMarketingBaseUrl();
  return {
    privacy: `${base}/privacy`,
    terms: `${base}/terms`,
    support: `${base}/support`,
    deleteAccount: `${base}/delete-account`,
    accountSettings: `${getWebsiteOrigin()}/console/settings`,
  };
}
