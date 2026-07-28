import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS,
  verifyInitData,
} from "./telegram-init-data";

const BOT_TOKEN = "1234567890:test-bot-token";
const NOW_SECONDS = 1_800_000_000;

function makeInitData(
  user: object,
  botToken: string,
  authDate = String(Math.floor(Date.now() / 1000)),
): string {
  const userJson = JSON.stringify(user);
  const fields: Record<string, string> = {
    user: userJson,
    auth_date: authDate,
    chat_instance: "-123456789",
    chat_type: "private",
  };
  const keys: string[] = Object.keys(fields);
  keys.sort();
  const dataCheckString = keys.map((k) => `${k}=${fields[k]}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

function signFields(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const keys = Object.keys(fields);
  keys.sort();
  const dataCheckString = keys.map((key) => `${key}=${fields[key]}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const verifyAtFixedTime = (initData: string) =>
  verifyInitData(initData, BOT_TOKEN, { nowSeconds: () => NOW_SECONDS });

describe("verifyInitData", () => {
  it("returns the user for valid initData", () => {
    const user = { id: 42, first_name: "Alice", username: "alice" };
    const result = verifyInitData(makeInitData(user, BOT_TOKEN), BOT_TOKEN);
    expect(result).toMatchObject({ id: 42, first_name: "Alice", username: "alice" });
  });

  it("accepts a valid current auth_date", () => {
    const raw = makeInitData({ id: 42, first_name: "Alice" }, BOT_TOKEN, String(NOW_SECONDS));
    expect(verifyAtFixedTime(raw)).toMatchObject({ id: 42, first_name: "Alice" });
  });

  it("returns null when auth_date is missing", () => {
    const raw = signFields({
      user: JSON.stringify({ id: 42, first_name: "Alice" }),
    });
    expect(verifyAtFixedTime(raw)).toBeNull();
  });

  it("returns null when auth_date is malformed", () => {
    const raw = makeInitData({ id: 42, first_name: "Alice" }, BOT_TOKEN, "not-a-timestamp");
    expect(verifyAtFixedTime(raw)).toBeNull();
  });

  it("returns null when auth_date is stale", () => {
    const raw = makeInitData(
      { id: 42, first_name: "Alice" },
      BOT_TOKEN,
      String(NOW_SECONDS - TELEGRAM_INIT_DATA_MAX_AGE_SECONDS - 1),
    );
    expect(verifyAtFixedTime(raw)).toBeNull();
  });

  it("returns null when auth_date is excessively far in the future", () => {
    const raw = makeInitData(
      { id: 42, first_name: "Alice" },
      BOT_TOKEN,
      String(NOW_SECONDS + TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS + 1),
    );
    expect(verifyAtFixedTime(raw)).toBeNull();
  });

  it("returns null when hash is tampered", () => {
    const raw = makeInitData({ id: 1, first_name: "Bob" }, BOT_TOKEN);
    const tampered = raw.replace(/hash=[^&]+/, "hash=deadbeef");
    expect(verifyInitData(tampered, BOT_TOKEN)).toBeNull();
  });

  it("returns null when initData is missing hash", () => {
    expect(verifyInitData("user=%7B%7D&auth_date=1", BOT_TOKEN)).toBeNull();
  });

  it("returns null when initData is empty", () => {
    expect(verifyInitData("", BOT_TOKEN)).toBeNull();
  });

  it("returns null when user field is missing", () => {
    const raw = signFields({
      auth_date: String(NOW_SECONDS),
      chat_instance: "-123456789",
      chat_type: "private",
    });
    expect(verifyAtFixedTime(raw)).toBeNull();
  });

  it("returns null when user JSON is malformed", () => {
    const raw = signFields({
      user: "not-json",
      auth_date: String(NOW_SECONDS),
    });
    expect(verifyAtFixedTime(raw)).toBeNull();
  });

  it.each([
    { id: "42", first_name: "Alice" },
    { id: 42 },
    { id: 42, first_name: "Alice", username: 7 },
  ])("returns null when the signed user shape is invalid", (user) => {
    expect(verifyInitData(makeInitData(user, BOT_TOKEN), BOT_TOKEN)).toBeNull();
  });
});
