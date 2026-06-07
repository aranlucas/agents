import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native/Libraries/Core/InitializeCore", () => ({}));
vi.mock("whatwg-fetch", () => ({}));
vi.mock("expo", () => ({}));
vi.mock("expo/fetch", () => ({ fetch: vi.fn(async () => new Response("ok")) }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { router: { origin: true } } } },
}));

describe("fetch polyfill", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, "__DEV__", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: { location: { origin: "https://app.test" } },
      configurable: true,
    });
  });

  it("wraps relative string and request-like URLs once", async () => {
    const calls: unknown[][] = [];
    const baseFetch = vi.fn(async (...args: unknown[]) => {
      calls.push(args);
      return "ok";
    });
    const { wrapFetchWithWindowLocation } = await import("./fetch-polyfill");

    const wrapped = wrapFetchWithWindowLocation(baseFetch);
    expect(wrapFetchWithWindowLocation(wrapped)).toBe(wrapped);

    await wrapped("/api/test");
    const request = { url: "/api/other" };
    await wrapped(request);
    await wrapped("https://external.test");

    expect(calls[0][0]).toBe("https://app.test/api/test");
    expect(request.url).toBe("https://app.test/api/other");
    expect(calls[2][0]).toBe("https://external.test");
  });
});
