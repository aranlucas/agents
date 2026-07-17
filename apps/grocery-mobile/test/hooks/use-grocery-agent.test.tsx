import { renderHook, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGroceryAgentController } from "@/hooks/use-grocery-agent";

const mocks = vi.hoisted(() => ({
  auth: {
    getToken: vi.fn<() => Promise<string | null>>(),
    userId: "user_1" as string | null,
  },
  agent: null as any,
  copilotkit: null as any,
  onError: undefined as ((event: any) => void | Promise<void>) | undefined,
}));

vi.mock("@clerk/clerk-expo", () => ({ useAuth: () => mocks.auth }));
vi.mock("@copilotkit/react-native", () => ({
  useAgent: () => ({ agent: mocks.agent }),
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
});

describe("useGroceryAgentController", () => {
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
    const snapshot = {
      messages: [...agent.messages],
      state: structuredClone(agent.state),
      pendingInterrupts: [...agent.pendingInterrupts],
    };
    const failure = new Error("agent failed after resolving");
    copilotkit.runAgent.mockImplementationOnce(async () => {
      agent.messages.push({ id: "partial", role: "assistant", content: "Partial" });
      agent.state = { status: "shopping" };
      agent.pendingInterrupts = [{ id: "partial_interrupt" }];
      await emit("agent_run_failed", failure);
    });
    const onRunComplete = vi.fn();
    const hook = await renderHook(() => useGroceryAgentController(onRunComplete));

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
    expect(agent.state).toEqual({});
    expect(agent.pendingInterrupts).toEqual([]);
    await waitFor(() => expect(hook.result.current.isRunning).toBe(false));
  });

  it("fully restores failed thread history and clears the target before retrying it", async () => {
    mocks.auth.getToken.mockResolvedValue("token_1");
    const { agent, copilotkit } = setupAgent();
    const snapshot = {
      threadId: agent.threadId,
      messages: [...agent.messages],
      state: structuredClone(agent.state),
      pendingInterrupts: [...agent.pendingInterrupts],
    };
    const connectFailure = new Error("history unavailable");
    copilotkit.connectAgent
      .mockImplementationOnce(async () => {
        expect(agent.threadId).toBe("thread_target");
        expect(agent.messages).toEqual([]);
        expect(agent.state).toEqual({});
        expect(agent.pendingInterrupts).toEqual([]);
        agent.messages.push({ id: "stale", role: "assistant", content: "Stale target" });
        agent.state = { status: "shopping" };
        agent.pendingInterrupts = [{ id: "stale_interrupt" }];
        await emit("agent_connect_failed", connectFailure);
      })
      .mockImplementationOnce(async () => {
        expect(agent.threadId).toBe("thread_target");
        expect(agent.messages).toEqual([]);
        expect(agent.state).toEqual({});
        expect(agent.pendingInterrupts).toEqual([]);
        agent.messages.push({ id: "history", role: "assistant", content: "Loaded history" });
      });
    const hook = await renderHook(() => useGroceryAgentController(vi.fn()));

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
