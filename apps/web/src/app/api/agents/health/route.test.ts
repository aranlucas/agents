import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    AGENTS_BASE_URL: "http://agents.test",
  },
}));

describe("GET /api/agents/health", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns per-agent status and running count", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: url.includes("travel") || url.includes("a2ui"),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agents.test/travel/health",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agents.test/oralboards/health",
      expect.any(Object),
    );
    expect(body).toEqual({
      agents: {
        travel: "ok",
        grocery: "error",
        fitness: "error",
        wellness: "error",
        "oral-boards": "error",
        a2ui: "ok",
      },
      runningCount: 2,
      total: 6,
    });
  });

  it("marks agents as errored when health checks throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.runningCount).toBe(0);
    expect(Object.values(body.agents)).toEqual([
      "error",
      "error",
      "error",
      "error",
      "error",
      "error",
    ]);
  });
});
