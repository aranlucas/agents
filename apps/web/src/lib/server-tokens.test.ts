import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getUserOauthAccessTokenMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({
    users: {
      getUserOauthAccessToken: getUserOauthAccessTokenMock,
    },
  })),
}));

describe("server token helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disconnected Kroger state when the user is not signed in", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    const { getKrogerAccessToken } = await import("./kroger-token");
    await expect(getKrogerAccessToken()).resolves.toEqual({
      connected: false,
      token: null,
    });
    expect(getUserOauthAccessTokenMock).not.toHaveBeenCalled();
  });

  it("returns the Kroger token for signed-in users", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_123" });
    getUserOauthAccessTokenMock.mockResolvedValueOnce({ data: [{ token: "kroger-token" }] });
    const { getKrogerAccessToken, KROGER_PROVIDER } = await import("./kroger-token");
    await expect(getKrogerAccessToken()).resolves.toEqual({
      connected: true,
      token: "kroger-token",
    });
    expect(getUserOauthAccessTokenMock).toHaveBeenCalledWith("user_123", KROGER_PROVIDER);
  });

  it("returns disconnected Kroger state when Clerk has no token", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_123" });
    getUserOauthAccessTokenMock.mockResolvedValueOnce({ data: [] });
    const { getKrogerAccessToken } = await import("./kroger-token");
    await expect(getKrogerAccessToken()).resolves.toEqual({
      connected: false,
      token: null,
    });
  });

  it("returns disconnected Strava state when the user is not signed in", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    const { getStravaAccessToken } = await import("./strava-token");
    await expect(getStravaAccessToken()).resolves.toEqual({
      connected: false,
      token: null,
    });
    expect(getUserOauthAccessTokenMock).not.toHaveBeenCalled();
  });

  it("rejects expired Strava tokens", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_123" });
    getUserOauthAccessTokenMock.mockResolvedValueOnce({
      data: [{ token: "strava-token", expiresAt: 1 }],
    });
    const { getStravaAccessToken } = await import("./strava-token");
    await expect(getStravaAccessToken()).resolves.toEqual({
      connected: false,
      token: null,
    });
  });

  it("returns disconnected Strava state when Clerk has no token", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_123" });
    getUserOauthAccessTokenMock.mockResolvedValueOnce({ data: [] });
    const { getStravaAccessToken } = await import("./strava-token");
    await expect(getStravaAccessToken()).resolves.toEqual({
      connected: false,
      token: null,
    });
  });

  it("returns active Strava tokens", async () => {
    authMock.mockResolvedValueOnce({ userId: "user_123" });
    getUserOauthAccessTokenMock.mockResolvedValueOnce({
      data: [{ token: "strava-token", expiresAt: Math.ceil(Date.now() / 1000) + 60 }],
    });
    const { getStravaAccessToken, STRAVA_PROVIDER } = await import("./strava-token");
    await expect(getStravaAccessToken()).resolves.toEqual({
      connected: true,
      token: "strava-token",
    });
    expect(getUserOauthAccessTokenMock).toHaveBeenCalledWith("user_123", STRAVA_PROVIDER);
  });
});
