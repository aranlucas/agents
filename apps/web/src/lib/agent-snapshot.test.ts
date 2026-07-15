import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAgentSnapshot, parseAgentSnapshot } from "./agent-snapshot";

describe("agent snapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses serializable persisted state and messages", () => {
    const snapshot = parseAgentSnapshot(
      {
        threadId: "thread-123",
        threadExists: true,
        state: { status: "idle" },
        messages: [{ id: "message-1", role: "assistant", content: "Ready" }],
      },
      "thread-123",
    );

    expect(snapshot).toEqual({
      threadId: "thread-123",
      threadExists: true,
      state: { status: "idle" },
      messages: [{ id: "message-1", role: "assistant", content: "Ready" }],
    });
  });

  it("rejects a snapshot for a different thread", () => {
    expect(
      parseAgentSnapshot(
        { threadId: "other", threadExists: true, state: {}, messages: [] },
        "thread-123",
      ),
    ).toBeNull();
  });

  it("loads the snapshot with the matching server identity", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        threadId: "thread-123",
        threadExists: true,
        state: {},
        messages: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchAgentSnapshot({
        baseUrl: "https://gateway.example/agui/",
        agentId: "resume",
        threadId: "thread-123",
        token: "server-token",
      }),
    ).resolves.toMatchObject({ threadId: "thread-123", threadExists: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/resume/agents/state",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer server-token",
        },
        body: JSON.stringify({ threadId: "thread-123" }),
      }),
    );
  });
});
