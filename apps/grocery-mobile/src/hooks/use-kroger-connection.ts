import { useUser } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { readableError } from "@/lib/auth";
import {
  hasKrogerConnection,
  isKrogerConnection,
  rotatingTokenNonceFromCallback,
} from "@/lib/connections";

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;
type ClerkExternalAccount = ClerkUser["externalAccounts"][number];
type ConnectionAction = "connect" | "reconnect";

export function useKrogerConnection() {
  const { isLoaded, user } = useUser();
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<ConnectionAction | null>(null);
  const [error, setError] = useState("");
  const initialRefresh = useRef(false);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await user.reload();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || initialRefresh.current) return;
    initialRefresh.current = true;
    void refresh();
  }, [refresh, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const accounts = user?.externalAccounts ?? [];
  const completeAuthorization = useCallback(
    async (externalAccount: ClerkExternalAccount, redirectUrl: string) => {
      const verificationUrl = externalAccount.verification?.externalVerificationRedirectURL;
      if (!verificationUrl) throw new Error("Kroger did not return a connection page.");

      const result = await WebBrowser.openAuthSessionAsync(verificationUrl.href, redirectUrl);
      if (result.type !== "success" || !result.url) return false;

      const linkedAccount = await externalAccount.reload({
        rotatingTokenNonce: rotatingTokenNonceFromCallback(result.url),
      });
      await user?.reload();
      if (linkedAccount.verification?.status !== "verified") {
        throw new Error("Kroger returned without completing the account connection.");
      }
      return true;
    },
    [user],
  );
  const authorize = useCallback(
    async (nextAction: ConnectionAction) => {
      if (!user || action) return false;
      setAction(nextAction);
      setError("");
      try {
        const redirectUrl = Linking.createURL("kroger-callback");
        const currentAccount = user.externalAccounts.find(isKrogerConnection);
        const externalAccount =
          nextAction === "reconnect" && currentAccount
            ? await currentAccount.reauthorize({ redirectUrl })
            : await user.createExternalAccount({
                strategy: "oauth_custom_shopping",
                redirectUrl,
              });
        return await completeAuthorization(externalAccount, redirectUrl);
      } catch (caught) {
        setError(readableError(caught));
        return false;
      } finally {
        setAction(null);
      }
    },
    [action, completeAuthorization, user],
  );
  const connect = useCallback(() => authorize("connect"), [authorize]);
  const reconnect = useCallback(() => authorize("reconnect"), [authorize]);

  return {
    connected: hasKrogerConnection(accounts),
    isLoading: !isLoaded || !user || refreshing || action !== null,
    connecting: action !== null,
    reconnecting: action === "reconnect",
    error,
    clearError: () => setError(""),
    connect,
    reconnect,
    refresh,
  };
}
