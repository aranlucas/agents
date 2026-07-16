import { useUser } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { readableError } from "@/lib/auth";
import {
  hasKrogerConnection,
  rotatingTokenNonceFromCallback,
  type ExternalAccountLike,
} from "@/lib/connections";

export function useKrogerConnection() {
  const { isLoaded, user } = useUser();
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
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

  const accounts = (user?.externalAccounts ?? []) as ExternalAccountLike[];
  const connect = useCallback(async () => {
    if (!user || connecting) return false;
    setConnecting(true);
    setError("");
    try {
      const redirectUrl = Linking.createURL("kroger-callback");
      const externalAccount = await user.createExternalAccount({
        strategy: "oauth_custom_shopping",
        redirectUrl,
      });
      const verificationUrl = externalAccount.verification?.externalVerificationRedirectURL;
      if (!verificationUrl) throw new Error("Kroger did not return a connection page.");

      const result = await WebBrowser.openAuthSessionAsync(verificationUrl.href, redirectUrl);
      if (result.type !== "success" || !result.url) return false;

      const linkedAccount = await externalAccount.reload({
        rotatingTokenNonce: rotatingTokenNonceFromCallback(result.url),
      });
      await user.reload();
      if (linkedAccount.verification?.status !== "verified") {
        throw new Error("Kroger returned without completing the account connection.");
      }
      return true;
    } catch (caught) {
      setError(readableError(caught));
      return false;
    } finally {
      setConnecting(false);
    }
  }, [connecting, user]);

  return {
    connected: hasKrogerConnection(accounts),
    isLoading: !isLoaded || !user || refreshing,
    connecting,
    error,
    clearError: () => setError(""),
    connect,
    refresh,
  };
}
