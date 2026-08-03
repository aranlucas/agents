import { renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useGroceryAgentController,
  useGroceryMessages,
  useGroceryState,
} from "@/hooks/use-grocery-agent";
import { INITIAL_GROCERY_STATE } from "@/lib/grocery-state";

const mocks = vi.hoisted(() => ({
  auth: {
    getToken: vi.fn<() => Promise<string | null>>(),
    userId: "user_1" as string | null,
  },
  agent: null as any,
  copilotkit: null as any,
  onError: undefined as ((event: any) => void | Promise<void>) | undefined,
  useAgent: vi.fn(),
}));

vi.mock("@clerk/clerk-expo", () => ({ useAuth: () => mocks.auth }));
vi.mock("@copilotkit/react-native/headless", () => ({
  useAgent: mocks.useAgent,
  useCopilotKit: () => ({ copilotkit: mocks.copilotkit }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function setupAgent() {
  const agent: any = {
    threadId: "thread_old",
    messages: [{ id: "assistant_1", role: "assistant", content: "Existing answer" }],
    state: { status: "ready", nested: { value: 1 } },
    pendingInterrupts: [{ id: "interrupt_1" }],
    isRunning: false,
    addMessage: vi.fn((message: any) => agent.messages.push(message)),
    setMessages: vi.fn((messages: any[]) => {
      agent.messages = messages;
    }),
    setState: vi.fn((state: any) => {
      agent.state = state;
    }),
  };
  const copilotkit: any = {
    headers: {} as Record<string, string>,
    runtimeConnectionStatus: "connected",
    setHeaders: vi.fn((headers: Record<string, string>) => {
      copilotkit.headers = headers;
    }),
    runAgent: vi.fn(async () => undefined),
    stopAgent: vi.fn(),
    connectAgent: vi.fn(async () => undefined),
    subscribe: vi.fn((subscriber: { onError?: typeof mocks.onError }) => {
      mocks.onError = subscriber.onError;
      return { unsubscribe: vi.fn() };
    }),
  };
  mocks.agent = agent;
  mocks.copilotkit = copilotkit;
  return { agent, copilotkit };
}

async function emit(code: string, error: Error, agentId = "grocery") {
  await mocks.onError?.({ code, context: { agentId }, error });
}

beforeEach(() => {
  mocks.auth.getToken.mockReset();
  mocks.auth.userId = "user_1";
  mocks.onError = undefined;
  mocks.useAgent.mockReset();
  mocks.useAgent.mockImplementation(() => ({ agent: mocks.agent }));
});

describe("useGroceryAgentController", () => {
  it("subscribes each hook only to the CopilotKit updates it consumes", async () => {
    const { agent } = setupAgent();

    const controller = await renderHook(() => useGroceryAgentController(vi.fn()));
    expect(mocks.useAgent).toHaveBeenLastCalledWith({
      agentId: "grocery",
      updates: ["OnRunStatusChanged"],
      throttleMs: 50,
    });
    expect(controller.result.current).not.toHaveProperty("messages");
    expect(controller.result.current).not.toHaveProperty("state");
    expect(controller.result.current).not.toHaveProperty("isStreaming");
    expect(agent.state).toEqual({
      ...INITIAL_GROCERY_STATE,
      status: "ready",
      nested: { value: 1 },
    });

    mocks.useAgent.mockClear();
    const state = await renderHook(() => useGroceryState());
    expect(mocks.useAgent).toHaveBeenLastCalledWith({
      agentId: "grocery",
      updates: ["OnStateChanged"],
      throttleMs: 50,
    });
    expect(state.result.current.status).toBe("ready");

    mocks.useAgent.mockClear();
    const messages = await renderHook(() => useGroceryMessages());
    expect(mocks.useAgent).toHaveBeenLastCalledWith({
      agentId: "grocery",
      updates: ["OnMessagesChanged", "OnRunStatusChanged"],
      throttleMs: 50,
    });
    expect(messages.result.current.messages).toEqual([
      { id: "assistant_1", role: "assistant", content: "Existing answer" },
    ]);
    expect(messages.result.current.isStreaming).toBe(false);

    agent.isRunning = true;
    await messages.rerender(undefined);
    expect(messages.result.current.isStreaming).toBe(true);
  });

  it("waits for the real runtime agent before applying client defaults", async () => {
    const { agent, copilotkit } = setupAgent();
    copilotkit.runtimeConnectionStatus = "connecting";
    const hook = await renderHook(() => useGroceryAgentController(vi.fn()));

    expect(agent.setState).not.toHaveBeenCalled();

    copilotkit.runtimeConnectionStatus = "connected";
    await hook.rerender(undefined);

    expect(agent.state).toEqual({
      ...INITIAL_GROCERY_STATE,
      status: "ready",
      nested: { value: 1 },
    });
  });

  it("reserves Send synchronously before fresh Clerk token acquisition", async () => {
    const token = deferred<string | null>();
    mocks.auth.getToken.mockReturnValue(token.promise);
    const { agent, copilotkit } = setupAgent();
    const onRunComplete = vi.fn();
    const hook = await renderHook(() => useGroceryAgentController(onRunComplete));

    const first = hook.result.current.send("  milk  ");
    const second = hook.result.current.send("bread");
    await expect(second).resolves.toEqual({ status: "stopped", reason: "busy" });
    expect(mocks.auth.getToken).toHaveBeenCalledOnce();
    expect(agent.addMessage).not.toHaveBeenCalled();

    token.resolve("token_1");
    await expect(first).resolves.toEqual({ status: "success" });
    expect(agent.addMessage).toHaveBeenCalledOnce();
    expect(agent.addMessage.mock.calls[0]?.[0]).toMatchObject({ role: "user", content: "milk" });
    expect(copilotkit.runAgent).toHaveBeenCalledOnce();
    expect(onRunComplete).toHaveBeenCalledOnce();
  });

  it("rolls back an emitted run failure and retries the retained input only once", async () => {
    mocks.auth.getToken.mockResolvedValue("token_1");
    const { agent, copilotkit } = setupAgent();
    const failure = new Error("agent failed after resolving");
    copilotkit.runAgent.mockImplementationOnce(async () => {
      agent.messages.push({ id: "partial", role: "assistant", content: "Partial" });
      agent.state = { status: "shopping" };
      agent.pendingInterrupts = [{ id: "partial_interrupt" }];
      await emit("agent_run_failed", failure);
    });
    const onRunComplete = vi.fn();
    const hook = await renderHook(() => useGroceryAgentController(onRunComplete));
    const snapshot = {
      messages: [...agent.messages],
      state: structuredClone(agent.state),
      pendingInterrupts: [...agent.pendingInterrupts],
    };

    const outcome = await hook.result.current.send("  buy milk  ");

    expect(outcome).toMatchObject({ status: "failed", error: failure });
    expect(agent.messages).toEqual(snapshot.messages);
    expect(agent.state).toEqual(snapshot.state);
    expect(agent.pendingInterrupts).toEqual(snapshot.pendingInterrupts);
    await waitFor(() =>
      expect(hook.result.current.failure).toEqual({
        operation: "send",
        message: "agent failed after resolving",
        input: "buy milk",
      }),
    );
    expect(onRunComplete).not.toHaveBeenCalled();

    const retryRun = deferred<void>();
    copilotkit.runAgent.mockReturnValueOnce(retryRun.promise);
    const retry = hook.result.current.retry();
    const duplicate = hook.result.current.retry();
    await expect(duplicate).resolves.toEqual({ status: "stopped", reason: "busy" });
    retryRun.resolve();
    await expect(retry).resolves.toEqual({ status: "success" });
    expect(agent.addMessage.mock.calls.at(-1)?.[0]).toMatchObject({ content: "buy milk" });
    expect(copilotkit.runAgent).toHaveBeenCalledTimes(2);
    expect(onRunComplete).toHaveBeenCalledOnce();
  });

  it("stops during token acquisition without entering the SDK", async () => {
    const token = deferred<string | null>();
    mocks.auth.getToken.mockReturnValue(token.promise);
    const { agent, copilotkit } = setupAgent();
    const hook = await renderHook(() => useGroceryAgentController(vi.fn()));

    const send = hook.result.current.send("milk");
    const stop = hook.result.current.stop();
    await Promise.resolve();
    token.resolve("token_1");
    await expect(send).resolves.toEqual({ status: "stopped", reason: "cancelled" });
    await expect(stop).resolves.toEqual({ status: "stopped", reason: "cancelled" });
    expect(agent.addMessage).not.toHaveBeenCalled();
    expect(copilotkit.runAgent).not.toHaveBeenCalled();
    expect(copilotkit.stopAgent).not.toHaveBeenCalled();
  });

  it("stops an SDK run once, retains partial output, and ignores abort emissions", async () => {
    mocks.auth.getToken.mockResolvedValue("token_1");
    const run = deferred<void>();
    const { agent, copilotkit } = setupAgent();
    copilotkit.runAgent.mockImplementation(async () => {
      agent.messages.push({ id: "partial", role: "assistant", content: "Partial output" });
      return run.promise;
    });
    const hook = await renderHook(() => useGroceryAgentController(vi.fn()));
    const send = hook.result.current.send("milk");
    await waitFor(() => expect(copilotkit.runAgent).toHaveBeenCalledOnce());

    const stop = hook.result.current.stop();
    await emit("agent_run_failed", new Error("aborted"));
    expect(copilotkit.stopAgent).toHaveBeenCalledOnce();
    run.resolve();
    await expect(send).resolves.toEqual({ status: "stopped", reason: "cancelled" });
    await expect(stop).resolves.toEqual({ status: "stopped", reason: "cancelled" });
    expect(agent.messages).toContainEqual({
      id: "partial",
      role: "assistant",
      content: "Partial output",
    });
    expect(hook.result.current.failure).toBeNull();
  });

  it("replaces an active SDK run before resetting to a new chat", async () => {
    mocks.auth.getToken.mockResolvedValue("token_1");
    const run = deferred<void>();
    const { agent, copilotkit } = setupAgent();
    copilotkit.runAgent.mockReturnValue(run.promise);
    const hook = await renderHook(() => useGroceryAgentController(vi.fn()));
    const send = hook.result.current.send("milk");
    await waitFor(() => expect(copilotkit.runAgent).toHaveBeenCalledOnce());

    const oldThreadId = agent.threadId;
    const newChat = hook.result.current.startNewChat();
    expect(copilotkit.stopAgent).toHaveBeenCalledOnce();
    expect(agent.threadId).toBe(oldThreadId);

    run.resolve();
    await expect(send).resolves.toEqual({ status: "stopped", reason: "cancelled" });
    await expect(newChat).resolves.toEqual({ status: "success" });
    expect(agent.threadId).not.toBe(oldThreadId);
    expect(agent.messages).toEqual([]);
    expect(agent.state).toEqual(INITIAL_GROCERY_STATE);
    expect(agent.pendingInterrupts).toEqual([]);
    await waitFor(() => expect(hook.result.current.isRunning).toBe(false));
  });

  it("fully restores failed thread history and clears the target before retrying it", async () => {
    mocks.auth.getToken.mockResolvedValue("token_1");
    const { agent, copilotkit } = setupAgent();
    const connectFailure = new Error("history unavailable");
    copilotkit.connectAgent
      .mockImplementationOnce(async () => {
        expect(agent.threadId).toBe("thread_target");
        expect(agent.messages).toEqual([]);
        expect(agent.state).toEqual(INITIAL_GROCERY_STATE);
        expect(agent.pendingInterrupts).toEqual([]);
        agent.messages.push({ id: "stale", role: "assistant", content: "Stale target" });
        agent.state = { status: "shopping" };
        agent.pendingInterrupts = [{ id: "stale_interrupt" }];
        await emit("agent_connect_failed", connectFailure);
      })
      .mockImplementationOnce(async () => {
        expect(agent.threadId).toBe("thread_target");
        expect(agent.messages).toEqual([]);
        expect(agent.state).toEqual(INITIAL_GROCERY_STATE);
        expect(agent.pendingInterrupts).toEqual([]);
        agent.messages.push({ id: "history", role: "assistant", content: "Loaded history" });
      });
    const hook = await renderHook(() => useGroceryAgentController(vi.fn()));
    const snapshot = {
      threadId: agent.threadId,
      messages: [...agent.messages],
      state: structuredClone(agent.state),
      pendingInterrupts: [...agent.pendingInterrupts],
    };

    await expect(hook.result.current.openThread("thread_target")).resolves.toMatchObject({
      status: "failed",
      error: connectFailure,
    });
    expect(agent.threadId).toBe(snapshot.threadId);
    expect(agent.messages).toEqual(snapshot.messages);
    expect(agent.state).toEqual(snapshot.state);
    expect(agent.pendingInterrupts).toEqual(snapshot.pendingInterrupts);
    await waitFor(() =>
      expect(hook.result.current.failure).toEqual({
        operation: "open-thread",
        message: "history unavailable",
        threadId: "thread_target",
      }),
    );

    await expect(hook.result.current.openThread("thread_target")).resolves.toEqual({
      status: "success",
    });
    expect(agent.threadId).toBe("thread_target");
    expect(agent.messages).toEqual([
      { id: "history", role: "assistant", content: "Loaded history" },
    ]);
    expect(copilotkit.connectAgent).toHaveBeenCalledTimes(2);
  });
});
