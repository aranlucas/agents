// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

describe("env", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("parses required server and client environment values", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "secret");
    vi.stubEnv("AGENTS_BASE_URL", "http://127.0.0.1:8000");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_123");
    vi.stubEnv("GROQ_API_KEY", "gsk_fake");

    const { env } = await import("./env");

    expect(env.AGENTS_BASE_URL).toBe("http://127.0.0.1:8000");
    expect(env.GROQ_API_KEY).toBe("gsk_fake");
    expect(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe("pk_test_123");
  });

  it("defaults the server and browser gateway URLs when omitted", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "secret");
    vi.stubEnv("AGENTS_BASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_AGENTS_BASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_123");
    vi.stubEnv("GROQ_API_KEY", "gsk_fake");

    const { env } = await import("./env");
    expect(env.AGENTS_BASE_URL).toBe("https://agents-gateway.up.railway.app");
    expect(env.NEXT_PUBLIC_AGENTS_BASE_URL).toBe(env.AGENTS_BASE_URL);
  });
});
