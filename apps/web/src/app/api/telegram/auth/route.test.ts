import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS,
} from "@/lib/telegram-init-data";

const BOT_TOKEN = "test-bot-token";
const clerkClientMock = {
  users: {
    getUserList: vi.fn(),
    createUser: vi.fn(),
  },
  signInTokens: {
    createSignInToken: vi.fn(),
  },
};

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn().mockResolvedValue(clerkClientMock),
}));

vi.mock("@/env", () => ({
  env: { TELEGRAM_BOT_TOKEN: "test-bot-token" },
}));

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/telegram/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signFields(fields: Record<string, string>): string {
  const keys = Object.keys(fields);
  keys.sort();
  const dataCheckString = keys.map((key) => `${key}=${fields[key]}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

function makeInitData(user: object, authDate = String(Math.floor(Date.now() / 1000))): string {
  return signFields({
    auth_date: authDate,
    user: JSON.stringify(user),
  });
}

describe("POST /api/telegram/auth", () => {
  beforeEach(() => {
    vi.resetModules();
    clerkClientMock.users.getUserList.mockReset();
    clerkClientMock.users.createUser.mockReset();
    clerkClientMock.signInTokens.createSignInToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 when initData is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_init_data" });
  });

  it("returns 400 when HMAC verification fails", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: "bad_data" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when signed initData is missing auth_date", async () => {
    const initData = signFields({
      user: JSON.stringify({ id: 42, first_name: "Alice" }),
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData }));

    expect(res.status).toBe(400);
    expect(clerkClientMock.users.getUserList).not.toHaveBeenCalled();
  });

  it("returns 400 when signed initData has a malformed auth_date", async () => {
    const initData = makeInitData({ id: 42, first_name: "Alice" }, "not-a-timestamp");

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData }));

    expect(res.status).toBe(400);
    expect(clerkClientMock.users.getUserList).not.toHaveBeenCalled();
  });

  it("returns 400 when signed initData is stale", async () => {
    const authDate = Math.floor(Date.now() / 1000) - TELEGRAM_INIT_DATA_MAX_AGE_SECONDS - 60;
    const initData = makeInitData({ id: 42, first_name: "Alice" }, String(authDate));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData }));

    expect(res.status).toBe(400);
    expect(clerkClientMock.users.getUserList).not.toHaveBeenCalled();
  });

  it("returns 400 when signed initData is excessively far in the future", async () => {
    const authDate =
      Math.floor(Date.now() / 1000) + TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS + 60;
    const initData = makeInitData({ id: 42, first_name: "Alice" }, String(authDate));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData }));

    expect(res.status).toBe(400);
    expect(clerkClientMock.users.getUserList).not.toHaveBeenCalled();
  });

  it("creates a new user from valid current initData and returns a sign-in token", async () => {
    const tgUser = { id: 42, first_name: "Alice" };
    clerkClientMock.users.getUserList.mockResolvedValue({ data: [] });
    clerkClientMock.users.createUser.mockResolvedValue({ id: "user_new_123" });
    clerkClientMock.signInTokens.createSignInToken.mockResolvedValue({ token: "sit_abc" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: makeInitData(tgUser) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: "sit_abc" });

    expect(clerkClientMock.users.createUser).toHaveBeenCalledWith({
      externalId: "42",
      firstName: "Alice",
      lastName: undefined,
    });
    expect(clerkClientMock.signInTokens.createSignInToken).toHaveBeenCalledWith({
      userId: "user_new_123",
      expiresInSeconds: 300,
    });
  });

  it("finds existing user by externalId and returns sign-in token", async () => {
    const tgUser = { id: 99, first_name: "Bob" };
    clerkClientMock.users.getUserList.mockResolvedValue({ data: [{ id: "user_existing_456" }] });
    clerkClientMock.signInTokens.createSignInToken.mockResolvedValue({ token: "sit_xyz" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: makeInitData(tgUser) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: "sit_xyz" });

    expect(clerkClientMock.users.createUser).not.toHaveBeenCalled();
    expect(clerkClientMock.signInTokens.createSignInToken).toHaveBeenCalledWith({
      userId: "user_existing_456",
      expiresInSeconds: 300,
    });
  });

  it("signs into the linked account when the shadow user carries linked_clerk_user_id", async () => {
    const tgUser = { id: 99, first_name: "Bob" };
    clerkClientMock.users.getUserList.mockResolvedValue({
      data: [
        {
          id: "user_shadow_789",
          privateMetadata: { linked_clerk_user_id: "user_real_123" },
        },
      ],
    });
    clerkClientMock.signInTokens.createSignInToken.mockResolvedValue({ token: "sit_linked" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: makeInitData(tgUser) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: "sit_linked" });

    expect(clerkClientMock.users.createUser).not.toHaveBeenCalled();
    expect(clerkClientMock.signInTokens.createSignInToken).toHaveBeenCalledWith({
      userId: "user_real_123",
      expiresInSeconds: 300,
    });
  });

  it("returns 500 when Clerk throws", async () => {
    const tgUser = { id: 1, first_name: "X" };
    clerkClientMock.users.getUserList.mockRejectedValue(new Error("clerk down"));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: makeInitData(tgUser) }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "auth_failed" });
  });
});
