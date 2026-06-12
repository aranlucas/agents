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

    const { env } = await import("./env");

    expect(env.AGENTS_BASE_URL).toBe("http://127.0.0.1:8000");
    expect(env.COPILOTKIT_DEBUG).toBe(false);
  });

  it("enables COPILOTKIT_DEBUG only when explicitly 'true'", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "secret");
    vi.stubEnv("AGENTS_BASE_URL", "http://127.0.0.1:8000");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_123");
    vi.stubEnv("COPILOTKIT_DEBUG", "true");

    const { env } = await import("./env");
    expect(env.COPILOTKIT_DEBUG).toBe(true);
  });
});
