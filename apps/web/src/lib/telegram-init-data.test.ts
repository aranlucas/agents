import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./telegram-init-data";

const BOT_TOKEN = "1234567890:test-bot-token";

function makeInitData(user: object, botToken: string): string {
  const userJson = JSON.stringify(user);
  const fields: Record<string, string> = {
    user: userJson,
    auth_date: String(Math.floor(Date.now() / 1000)),
    chat_instance: "-123456789",
    chat_type: "private",
  };
  const dataCheckString = Object.keys(fields)
    .toSorted()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("verifyInitData", () => {
  it("returns the user for valid initData", () => {
    const user = { id: 42, first_name: "Alice", username: "alice" };
    const result = verifyInitData(makeInitData(user, BOT_TOKEN), BOT_TOKEN);
    expect(result).toMatchObject({ id: 42, first_name: "Alice", username: "alice" });
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
    const raw = makeInitData({ id: 1, first_name: "Bob" }, BOT_TOKEN);
    const noUser = raw.replace(/user=[^&]+&?/, "");
    expect(verifyInitData(noUser, BOT_TOKEN)).toBeNull();
  });

  it("returns null when user JSON is malformed", () => {
    const params = new URLSearchParams({ user: "not-json", auth_date: "1" });
    const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const dcs = "auth_date=1\nuser=not-json";
    const hash = createHmac("sha256", secretKey).update(dcs).digest("hex");
    params.set("hash", hash);
    expect(verifyInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });
});
