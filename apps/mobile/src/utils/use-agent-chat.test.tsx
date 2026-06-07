import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMessage = vi.fn();
let mockedAgentState = {
  messages: [] as Array<{ id: string; role: string; content: string }>,
  state: { ready: true },
  isLoading: false,
  error: null as string | null,
};

vi.mock("./use-agent", () => ({
  useAgent: () => ({
    ...mockedAgentState,
    sendMessage,
  }),
}));

describe("useAgentChat", () => {
  beforeEach(() => {
    sendMessage.mockReset();
    mockedAgentState = {
      messages: [],
      state: { ready: true },
      isLoading: false,
      error: null,
    };
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
    });
  });

  it("adapts agent state to chat context and sends trimmed input", async () => {
    const { useAgentChat } = await import("./use-agent-chat");
    const snapshots: unknown[] = [];

    function Harness() {
      const chat = useAgentChat({ url: "http://agent.test" }, {});
      const { input, onSend, setInput } = chat;
      const updated = React.useRef(false);
      const sent = React.useRef(false);
      snapshots.push(chat);
      useEffect(() => {
        if (updated.current) return;
        updated.current = true;
        setInput(" hello ");
      }, [setInput]);
      useEffect(() => {
        if (sent.current) return;
        if (input) onSend();
        if (input) sent.current = true;
      }, [input, onSend]);
      return null;
    }

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Harness />);
    });
    await act(async () => {});

    expect(sendMessage).toHaveBeenCalledWith("hello");
    const latest = snapshots.at(-1) as ReturnType<typeof useAgentChat<Record<string, unknown>>>;
    expect(latest.input).toBe("");
    expect(latest.state).toEqual({ ready: true });

    await act(async () => {
      tree!.unmount();
    });
  });

  it("streams the last assistant message through the streaming store", async () => {
    const { useAgentChat } = await import("./use-agent-chat");
    mockedAgentState = {
      messages: [
        { id: "u1", role: "user", content: "Hi" },
        { id: "a1", role: "assistant", content: "Partial" },
      ],
      state: { ready: true },
      isLoading: true,
      error: "down",
    };
    let snapshot:
      | {
          messages: Array<{ id: string; role: string; content: string }>;
          streamingStore: { get: () => string };
          error: Error | null;
        }
      | undefined;

    function Harness() {
      snapshot = useAgentChat({ url: "http://agent.test" }, {});
      return null;
    }

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<Harness />);
    });

    expect(snapshot!.messages).toEqual([
      { id: "u1", role: "user", content: "Hi" },
      { id: "a1", role: "assistant", content: "" },
    ]);
    expect(snapshot!.streamingStore.get()).toBe("Partial");
    expect(snapshot!.error).toBeInstanceOf(Error);

    mockedAgentState = { ...mockedAgentState, isLoading: false };
    await act(async () => {
      tree!.update(<Harness />);
    });
    expect(snapshot!.streamingStore.get()).toBe("");

    await act(async () => {
      tree!.unmount();
    });
  });
});
