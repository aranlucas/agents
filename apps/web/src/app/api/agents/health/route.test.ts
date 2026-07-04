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
      ok: url.includes("travel") || url.includes("trends"),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agents.test/excalidraw/health",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith("http://agents.test/travel/health", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("http://agents.test/expense/health", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agents.test/oralboards/health",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith("http://agents.test/resume/health", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agents.test/research/health",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agents.test/spreadsheet/health",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agents.test/presentation/health",
      expect.any(Object),
    );
    expect(body).toEqual({
      agents: {
        excalidraw: "error",
        travel: "ok",
        grocery: "error",
        fitness: "error",
        wellness: "error",
        expense: "error",
        "oral-boards": "error",
        trends: "ok",
        resume: "error",
        research: "error",
        spreadsheet: "error",
        presentation: "error",
      },
      runningCount: 2,
      total: 12,
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
      "error",
      "error",
      "error",
      "error",
      "error",
      "error",
    ]);
  });

  it("returns the offline fixture without network calls when agent test mode is offline", async () => {
    vi.stubEnv("AGENT_TEST_MODE", "offline");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { GET } = await import("./route");
    const body = await (await GET()).json();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.runningCount).toBe(12);
    expect(Object.values(body.agents)).toEqual([
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
    ]);

    vi.unstubAllEnvs();
  });
});
