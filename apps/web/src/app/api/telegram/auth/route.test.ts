import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyInitDataMock = vi.fn();
const clerkClientMock = {
  users: {
    getUserList: vi.fn(),
    createUser: vi.fn(),
  },
  signInTokens: {
    createSignInToken: vi.fn(),
  },
};

vi.mock("@/lib/telegram-init-data", () => ({
  verifyInitData: verifyInitDataMock,
}));

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

describe("POST /api/telegram/auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 400 when initData is missing", async () => {
    verifyInitDataMock.mockReturnValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "invalid_init_data" });
  });

  it("returns 400 when HMAC verification fails", async () => {
    verifyInitDataMock.mockReturnValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: "bad_data" }));
    expect(res.status).toBe(400);
  });

  it("creates a new user and returns sign-in token for unknown Telegram user", async () => {
    const tgUser = { id: 42, first_name: "Alice" };
    verifyInitDataMock.mockReturnValue(tgUser);
    clerkClientMock.users.getUserList.mockResolvedValue({ data: [] });
    clerkClientMock.users.createUser.mockResolvedValue({ id: "user_new_123" });
    clerkClientMock.signInTokens.createSignInToken.mockResolvedValue({ token: "sit_abc" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: "valid_init_data" }));
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
    verifyInitDataMock.mockReturnValue({ id: 99, first_name: "Bob" });
    clerkClientMock.users.getUserList.mockResolvedValue({ data: [{ id: "user_existing_456" }] });
    clerkClientMock.signInTokens.createSignInToken.mockResolvedValue({ token: "sit_xyz" });

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: "valid_init_data" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: "sit_xyz" });

    expect(clerkClientMock.users.createUser).not.toHaveBeenCalled();
    expect(clerkClientMock.signInTokens.createSignInToken).toHaveBeenCalledWith({
      userId: "user_existing_456",
      expiresInSeconds: 300,
    });
  });

  it("returns 500 when Clerk throws", async () => {
    verifyInitDataMock.mockReturnValue({ id: 1, first_name: "X" });
    clerkClientMock.users.getUserList.mockRejectedValue(new Error("clerk down"));

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ initData: "valid" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "auth_failed" });
  });
});
