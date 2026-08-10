import { parse, validate } from "@tma.js/init-data-node";

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

export function verifyInitData(
  initData: string,
  botToken: string,
  { nowSeconds = () => Math.floor(Date.now() / 1000) }: VerifyInitDataOptions = {},
): TelegramUser | null {
  if (!initData) return null;

  try {
    // The library owns Telegram's signature protocol. Expiry stays explicit
    // below so tests and the server can share the same injected clock.
    validate(initData, botToken, { expiresIn: 0 });
    const params = new URLSearchParams(initData);
    // Older Telegram payloads omit the third-party `signature` field. The
    // parser models the current protocol, so normalize that optional legacy
    // field only after the bot-token signature has been verified.
    if (!params.has("signature")) params.set("signature", "");
    const parsed = parse(params);
    const authDate = Math.floor(parsed.auth_date.getTime() / 1000);
    const now = nowSeconds();
    if (
      !Number.isSafeInteger(authDate) ||
      !Number.isSafeInteger(now) ||
      authDate < now - TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ||
      authDate > now + TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS ||
      !isTelegramUser(parsed.user)
    ) {
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}
