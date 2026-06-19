import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getStravaAccessTokenMock = vi.fn();

vi.mock("@/lib/strava-token", () => ({
  STRAVA_PROVIDER: "oauth_custom_strava",
  getStravaAccessToken: getStravaAccessTokenMock,
}));

describe("GET /api/strava/token", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns token availability in development", async () => {
    getStravaAccessTokenMock.mockResolvedValueOnce({ connected: true, token: "token" });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({
      connected: true,
      debug: { provider: "oauth_custom_strava", tokenAvailable: true },
    });
  });

  it("converts primitive thrown values to debug messages", async () => {
    getStravaAccessTokenMock.mockRejectedValueOnce("boom");
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({
      connected: false,
      debug: { provider: "oauth_custom_strava", error: { message: "boom" } },
    });
  });

  it("returns sanitized Clerk errors in development", async () => {
    getStravaAccessTokenMock.mockRejectedValueOnce({
      clerkError: true,
      status: 401,
      message: "unauthorized",
      errors: [{ code: "bad_token", message: "Bad token", longMessage: "Reconnect" }],
    });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({
      connected: false,
      debug: {
        provider: "oauth_custom_strava",
        error: {
          clerkError: true,
          status: 401,
          message: "unauthorized",
          errors: [{ code: "bad_token", message: "Bad token", longMessage: "Reconnect" }],
        },
      },
    });
  });

  it("omits debug details in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    getStravaAccessTokenMock.mockResolvedValueOnce({ connected: false, token: null });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: false });
  });

  it("omits error debug details in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    getStravaAccessTokenMock.mockRejectedValueOnce(new Error("hidden"));
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: false });
  });

  it("returns the offline fixture without reading Clerk tokens in offline agent test mode", async () => {
    vi.stubEnv("AGENT_TEST_MODE", "offline");
    const { GET } = await import("./route");
    const body = await (await GET()).json();

    expect(getStravaAccessTokenMock).not.toHaveBeenCalled();
    expect(body).toEqual({ connected: false });
  });
});
