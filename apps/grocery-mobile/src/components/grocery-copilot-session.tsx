import { useAuth } from "@clerk/clerk-expo";
import { CopilotKitProvider } from "@copilotkit/react-native";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GroceryAgentProvider } from "@/components/grocery-agent-provider";
import { InlineError, SecondaryButton } from "@/components/ui";
import { readableError } from "@/lib/auth";
import { colors } from "@/lib/theme";

type SessionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; token: string; userId: string };

const EMPTY_HEADERS: Record<string, string> = {};

export function GroceryCopilotSession({
  runtimeUrl,
  children,
}: {
  runtimeUrl: string;
  children: ReactNode;
}) {
  const { getToken, userId } = useAuth();
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const loadSession = useCallback(async (): Promise<SessionState> => {
    try {
      if (!userId) throw new Error("Your session has expired. Please sign in again.");
      const token = await getTokenRef.current();
      if (!token) throw new Error("We could not refresh your session. Please sign in again.");
      return { status: "ready", token, userId };
    } catch (error) {
      return { status: "error", message: readableError(error) };
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    void loadSession().then((nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
    };
  }, [loadSession]);

  const retry = () => {
    setSession({ status: "loading" });
    void loadSession().then(setSession);
  };

  const headers = useMemo<Record<string, string>>(() => {
    if (session.status !== "ready") return EMPTY_HEADERS;
    return {
      Authorization: `Bearer ${session.token}`,
      "x-clerk-user-id": session.userId,
    };
  }, [session]);

  if (session.status === "loading") {
    return (
      <View
        accessibilityLabel="Loading Grocery Agent"
        accessibilityRole="progressbar"
        style={styles.centered}
      >
        <ActivityIndicator color={colors.green} size="large" />
        <Text style={styles.statusText}>Loading Grocery Agent…</Text>
      </View>
    );
  }

  if (session.status === "error") {
    return (
      <View style={styles.centered}>
        <InlineError message={session.message} />
        <SecondaryButton onPress={retry}>Try again</SecondaryButton>
      </View>
    );
  }

  return (
    <CopilotKitProvider runtimeUrl={runtimeUrl} headers={headers} useSingleEndpoint={false}>
      <GroceryAgentProvider>{children}</GroceryAgentProvider>
    </CopilotKitProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 28,
    backgroundColor: colors.background,
  },
  statusText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
