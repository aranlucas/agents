import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

/**
 * Telegram recommends checking `auth_date` to prevent outdated Mini App data
 * from being replayed. This sign-in flow exchanges init data immediately, so a
 * five-minute lifetime leaves room for normal network delays without allowing
 * a captured payload to remain useful indefinitely.
 */
export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 5 * 60;

/**
 * Permit a small amount of clock skew, while rejecting timestamps that are
 * materially ahead of the server clock.
 */
export const TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS = 30;

type VerifyInitDataOptions = {
  /** Returns the current Unix timestamp in seconds. */
  nowSeconds?: () => number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTelegramUser(value: unknown): value is TelegramUser {
  if (!isRecord(value)) return false;
  const user = value;
  if (!Number.isSafeInteger(user.id) || typeof user.first_name !== "string") return false;
  for (const field of ["last_name", "username", "language_code", "photo_url"] as const) {
    if (user[field] !== undefined && typeof user[field] !== "string") return false;
  }
  return user.is_premium === undefined || typeof user.is_premium === "boolean";
}

function parseAuthDate(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

export function verifyInitData(
  initData: string,
  botToken: string,
  { nowSeconds = () => Math.floor(Date.now() / 1000) }: VerifyInitDataOptions = {},
): TelegramUser | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;

  params.delete("hash");
  const entries: [string, string][] = Array.from(params.entries());
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  try {
    if (!timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(receivedHash, "hex"))) {
      return null;
    }
  } catch {
    return null;
  }

  const authDate = parseAuthDate(params.get("auth_date"));
  const now = nowSeconds();
  if (
    authDate === null ||
    !Number.isSafeInteger(now) ||
    authDate < now - TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ||
    authDate > now + TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS
  ) {
    return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    const user: unknown = JSON.parse(userRaw);
    return isTelegramUser(user) ? user : null;
  } catch {
    return null;
  }
}
