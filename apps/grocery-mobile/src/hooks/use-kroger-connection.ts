import { useUser } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useRef } from "react";
import { readableError } from "@/lib/auth";
import {
  hasKrogerConnection,
  isKrogerConnection,
  rotatingTokenNonceFromCallback,
} from "@/lib/connections";
import { groceryQueryKeys } from "@/lib/query-keys";

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;
type ClerkExternalAccount = ClerkUser["externalAccounts"][number];
type ConnectionAction = "connect" | "reconnect";

export function useKrogerConnection() {
  const { isLoaded, user } = useUser();
  const queryClient = useQueryClient();
  const authorizationInFlightRef = useRef(false);
  const queryKey = groceryQueryKeys.krogerConnection(user?.id);

  const connection = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      return user.reload();
    },
    enabled: isLoaded && Boolean(user),
    initialData: user ?? undefined,
    refetchOnMount: "always",
    retry: false,
  });

  const accounts = connection.data?.externalAccounts ?? user?.externalAccounts ?? [];
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
  const authorization = useMutation({
    mutationFn: async (nextAction: ConnectionAction) => {
      if (!user) throw new Error("Your session has expired. Please sign in again.");
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
    },
    onSuccess: (connected) => {
      if (connected) return queryClient.invalidateQueries({ queryKey });
    },
  });
  const { isPending: isAuthorizing, mutateAsync, reset: resetAuthorization } = authorization;
  const { isFetching, refetch } = connection;
  const authorize = useCallback(
    async (nextAction: ConnectionAction) => {
      if (authorizationInFlightRef.current || isAuthorizing) return false;
      authorizationInFlightRef.current = true;
      try {
        return await mutateAsync(nextAction);
      } catch {
        return false;
      } finally {
        authorizationInFlightRef.current = false;
      }
    },
    [isAuthorizing, mutateAsync],
  );
  const connect = useCallback(() => authorize("connect"), [authorize]);
  const reconnect = useCallback(() => authorize("reconnect"), [authorize]);
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    connected: hasKrogerConnection(accounts),
    isLoading: !isLoaded || !user || isFetching || isAuthorizing,
    connecting: isAuthorizing,
    reconnecting: isAuthorizing && authorization.variables === "reconnect",
    error: authorization.error
      ? readableError(authorization.error)
      : connection.error
        ? readableError(connection.error)
        : "",
    clearError: resetAuthorization,
    connect,
    reconnect,
    refresh,
  };
}
