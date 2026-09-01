import { parse, validate } from "@tma.js/init-data-node";
import { z } from "zod";

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

const telegramUserSchema = z.object({
  id: z.number().int().safe(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  photo_url: z.string().optional(),
}) satisfies z.ZodType<TelegramUser>;

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
    const user = telegramUserSchema.safeParse(parsed.user);
    const authDate = Math.floor(parsed.auth_date.getTime() / 1000);
    const now = nowSeconds();
    if (
      !Number.isSafeInteger(authDate) ||
      !Number.isSafeInteger(now) ||
      authDate < now - TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ||
      authDate > now + TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS ||
      !user.success
    ) {
      return null;
    }
    return user.data;
  } catch {
    return null;
  }
}
