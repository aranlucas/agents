import { beforeEach, describe, expect, it, vi } from "vitest";

const useQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => useQuery(config),
}));

describe("useAuthConnection", () => {
  beforeEach(() => {
    useQuery.mockReset();
  });

  it("configures the connection query and parses successful responses", async () => {
    const { useAuthConnection } = await import("./use-auth-connection");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ connected: true })));
    vi.stubGlobal("fetch", fetchMock);

    useAuthConnection({
      endpoint: "/api/token",
      enabled: true,
      queryKey: ["auth", "token"],
    });

    const config = useQuery.mock.calls[0][0];
    expect(config).toMatchObject({
      queryKey: ["auth", "token"],
      enabled: true,
      staleTime: 30_000,
      retry: 1,
    });
    await expect(config.queryFn()).resolves.toEqual({ connected: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/token");
  });

  it("throws when the connection endpoint fails", async () => {
    const { useAuthConnection } = await import("./use-auth-connection");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );

    useAuthConnection({
      endpoint: "/api/bad",
      enabled: false,
      queryKey: ["auth", "bad"],
    });

    const config = useQuery.mock.calls[0][0];
    await expect(config.queryFn()).rejects.toThrow("Failed to load auth connection from /api/bad");
  });
});
