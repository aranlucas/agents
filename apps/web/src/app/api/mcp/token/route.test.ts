import { beforeEach, describe, expect, it, vi } from "vitest";

const getKrogerAccessTokenMock = vi.fn();

vi.mock("@/lib/kroger-token", () => ({
  KROGER_PROVIDER: "custom_shopping",
  getKrogerAccessToken: getKrogerAccessTokenMock,
}));

describe("GET /api/mcp/token", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = "development";
  });

  it("returns connected state and development debug info", async () => {
    getKrogerAccessTokenMock.mockResolvedValueOnce({ connected: true, token: "token" });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({
      connected: true,
      debug: { provider: "custom_shopping", tokenAvailable: true },
    });
  });

  it("returns sanitized Clerk errors in development", async () => {
    getKrogerAccessTokenMock.mockRejectedValueOnce({
      clerkError: true,
      status: 404,
      message: "missing",
      errors: [{ code: "not_found", message: "No token", longMessage: "No OAuth token" }],
    });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({
      connected: false,
      debug: {
        provider: "custom_shopping",
        error: {
          clerkError: true,
          status: 404,
          message: "missing",
          errors: [{ code: "not_found", message: "No token", longMessage: "No OAuth token" }],
        },
      },
    });
  });

  it("converts primitive thrown values to debug messages", async () => {
    getKrogerAccessTokenMock.mockRejectedValueOnce("boom");
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({
      connected: false,
      debug: { provider: "custom_shopping", error: { message: "boom" } },
    });
  });

  it("omits debug details in production", async () => {
    process.env.NODE_ENV = "production";
    getKrogerAccessTokenMock.mockResolvedValueOnce({ connected: true, token: "token" });
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: true });
  });

  it("omits error debug details in production", async () => {
    process.env.NODE_ENV = "production";
    getKrogerAccessTokenMock.mockRejectedValueOnce(new Error("hidden"));
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: false });
  });
});
