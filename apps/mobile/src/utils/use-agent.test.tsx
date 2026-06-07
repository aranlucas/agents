import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runAgent = vi.fn();

vi.mock("@ag-ui/client", () => ({
  HttpAgent: class HttpAgent {
    messages: unknown[] = [];
    state: Record<string, unknown> = {};

    constructor(public config: unknown) {}

    runAgent = runAgent;
  },
}));

describe("useAgent", () => {
  beforeEach(() => {
    runAgent.mockReset();
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
    });
  });

  it("streams messages, merges state, and reports run errors", async () => {
    const { useAgent } = await import("./use-agent");
    const snapshots: unknown[] = [];

    function Harness() {
      const agent = useAgent({ url: "http://agent.test", headers: { auth: "yes" } }, { count: 1 });
      const sendAgentMessage = agent.sendMessage;
      const sent = React.useRef(false);
      snapshots.push(agent);
      useEffect(() => {
        if (sent.current) return;
        sent.current = true;
        void sendAgentMessage(" hello ");
      }, [sendAgentMessage]);
      return null;
    }

    runAgent.mockImplementation(async (_run, callbacks) => {
      callbacks.onMessagesChanged({
        messages: [
          { id: "1", role: "user", content: "hello" },
          { id: "2", role: "assistant", content: "world" },
          { id: "3", role: "tool", content: "hidden" },
          { id: "4", role: "assistant", content: 42 },
        ],
      });
      callbacks.onStateChanged({ state: { ready: true } });
      callbacks.onRunErrorEvent();
    });

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Harness />);
    });
    await act(async () => {});

    const latest = snapshots.at(-1) as ReturnType<typeof useAgent<Record<string, unknown>>>;
    expect(latest.messages).toEqual([
      { id: "1", role: "user", content: "hello" },
      { id: "2", role: "assistant", content: "world" },
    ]);
    expect(latest.state).toEqual({ count: 1, ready: true });
    expect(latest.error).toBe("Connection error. Is the agent running?");
    expect(runAgent).toHaveBeenCalledOnce();

    await act(async () => {
      tree!.unmount();
    });
  });

  it("ignores empty sends and catches thrown runs", async () => {
    const { useAgent } = await import("./use-agent");
    const snapshots: unknown[] = [];

    function Harness() {
      const agent = useAgent({ url: "http://agent.test" }, {});
      const sendAgentMessage = agent.sendMessage;
      const sent = React.useRef(false);
      snapshots.push(agent);
      useEffect(() => {
        if (sent.current) return;
        sent.current = true;
        void sendAgentMessage("   ");
        void sendAgentMessage("go");
      }, [sendAgentMessage]);
      return null;
    }

    runAgent.mockRejectedValue(new Error("down"));

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Harness />);
    });
    await act(async () => {});

    const latest = snapshots.at(-1) as ReturnType<typeof useAgent<Record<string, unknown>>>;
    expect(runAgent).toHaveBeenCalledOnce();
    expect(latest.error).toBe("Connection error. Is the agent running?");

    await act(async () => {
      tree!.unmount();
    });
  });
});
