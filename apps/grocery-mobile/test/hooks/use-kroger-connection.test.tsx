import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groceryQueryKeys } from "@/lib/query-keys";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";

const mocks = vi.hoisted(() => ({
  clerk: { isLoaded: true, user: null as any },
  createURL: vi.fn(() => "grocery-agent://kroger-callback"),
  openAuthSessionAsync: vi.fn(),
}));

vi.mock("@clerk/clerk-expo", () => ({ useUser: () => mocks.clerk }));
vi.mock("expo-linking", () => ({ createURL: mocks.createURL }));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: mocks.openAuthSessionAsync }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function makeAccount(status: "verified" | "unverified" = "unverified") {
  return {
    provider: "oauth_custom_shopping",
    verification: {
      status,
      externalVerificationRedirectURL: { href: "https://kroger.test/oauth" },
    },
    reload: vi.fn(),
    reauthorize: vi.fn(),
  };
}

function setup(userAccounts: any[] = []) {
  const user = {
    id: "user_1",
    externalAccounts: userAccounts,
    createExternalAccount: vi.fn(),
    reload: vi.fn(async () => user),
  };
  mocks.clerk.user = user;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, user, wrapper };
}

beforeEach(() => {
  mocks.clerk.isLoaded = true;
  mocks.clerk.user = null;
  mocks.createURL.mockClear();
  mocks.openAuthSessionAsync.mockReset();
});

describe("useKrogerConnection", () => {
  it("creates a new account, consumes the rotating nonce once, and invalidates only verified success", async () => {
    const account = makeAccount();
    const verified = makeAccount("verified");
    account.reload.mockResolvedValue(verified);
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "grocery-agent://kroger-callback?rotating_token_nonce=nonce_123",
    });
    const { invalidate, user, wrapper } = setup();
    user.createExternalAccount.mockResolvedValue(account);
    const hook = await renderHook(() => useKrogerConnection(), { wrapper });

    const connected = await hook.result.current.connect();

    expect(connected).toBe(true);
    expect(user.createExternalAccount).toHaveBeenCalledWith({
      strategy: "oauth_custom_shopping",
      redirectUrl: "grocery-agent://kroger-callback",
    });
    expect(account.reload).toHaveBeenCalledOnce();
    expect(account.reload).toHaveBeenCalledWith({ rotatingTokenNonce: "nonce_123" });
    expect(user.reload).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: groceryQueryKeys.krogerConnection("user_1"),
    });
  });

  it("reauthorizes the existing Kroger account instead of creating another", async () => {
    const current = makeAccount("verified");
    const authorization = makeAccount();
    const verified = makeAccount("verified");
    current.reauthorize.mockResolvedValue(authorization);
    authorization.reload.mockResolvedValue(verified);
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "grocery-agent://kroger-callback?rotating_token_nonce=nonce_2",
    });
    const { user, wrapper } = setup([current]);
    const hook = await renderHook(() => useKrogerConnection(), { wrapper });

    await expect(hook.result.current.reconnect()).resolves.toBe(true);

    expect(current.reauthorize).toHaveBeenCalledWith({
      redirectUrl: "grocery-agent://kroger-callback",
    });
    expect(user.createExternalAccount).not.toHaveBeenCalled();
  });

  it("synchronously rejects a rapid second authorization", async () => {
    const browser = deferred<{ type: string; url?: string }>();
    const account = makeAccount();
    const verified = makeAccount("verified");
    account.reload.mockResolvedValue(verified);
    mocks.openAuthSessionAsync.mockReturnValue(browser.promise);
    const { user, wrapper } = setup();
    user.createExternalAccount.mockResolvedValue(account);
    const hook = await renderHook(() => useKrogerConnection(), { wrapper });

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    first = hook.result.current.connect();
    second = hook.result.current.connect();
    await expect(second).resolves.toBe(false);
    expect(user.createExternalAccount).toHaveBeenCalledOnce();

    browser.resolve({
      type: "success",
      url: "grocery-agent://kroger-callback?rotating_token_nonce=nonce_3",
    });
    await expect(first).resolves.toBe(true);
  });

  it("treats browser cancellation and unverified completion as failures without success invalidation", async () => {
    const account = makeAccount();
    const { invalidate, user, wrapper } = setup();
    user.createExternalAccount.mockResolvedValue(account);
    mocks.openAuthSessionAsync.mockResolvedValueOnce({ type: "cancel" });
    const hook = await renderHook(() => useKrogerConnection(), { wrapper });

    await expect(hook.result.current.connect()).resolves.toBe(false);
    expect(account.reload).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();

    mocks.openAuthSessionAsync.mockResolvedValueOnce({
      type: "success",
      url: "grocery-agent://kroger-callback?rotating_token_nonce=nonce_4",
    });
    account.reload.mockResolvedValue(makeAccount("unverified"));
    await expect(hook.result.current.connect()).resolves.toBe(false);
    await waitFor(() =>
      expect(hook.result.current.error).toBe(
        "Kroger returned without completing the account connection.",
      ),
    );
    expect(invalidate).not.toHaveBeenCalled();

    hook.result.current.clearError();
    await waitFor(() => expect(hook.result.current.error).toBe(""));
  });
});
