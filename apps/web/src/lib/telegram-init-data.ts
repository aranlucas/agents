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

export function verifyInitData(initData: string, botToken: string): TelegramUser | null {
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

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    const user: unknown = JSON.parse(userRaw);
    return isTelegramUser(user) ? user : null;
  } catch {
    return null;
  }
}
