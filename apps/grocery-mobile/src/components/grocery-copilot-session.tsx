import { useAuth } from "@clerk/clerk-expo";
import { CopilotKitProvider } from "@copilotkit/react-native";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { View } from "react-native";
import { GroceryAgentProvider } from "@/components/grocery-agent-provider";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { readableError } from "@/lib/auth";
import { groceryQueryKeys } from "@/lib/query-keys";

const EMPTY_HEADERS: Record<string, string> = {};

export function GroceryCopilotSession({
  runtimeUrl,
  children,
}: {
  runtimeUrl: string;
  children: ReactNode;
}) {
  const { getToken, isLoaded, userId } = useAuth();
  const session = useQuery({
    queryKey: groceryQueryKeys.copilotSession(userId),
    queryFn: async () => {
      if (!userId) throw new Error("Your session has expired. Please sign in again.");
      const token = await getToken();
      if (!token) throw new Error("We could not refresh your session. Please sign in again.");
      return { token, userId };
    },
    enabled: isLoaded,
    retry: false,
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    gcTime: 0,
  });

  const headers = useMemo<Record<string, string>>(() => {
    if (!session.data) return EMPTY_HEADERS;
    return {
      Authorization: `Bearer ${session.data.token}`,
      "x-clerk-user-id": session.data.userId,
    };
  }, [session.data]);

  if (!isLoaded || session.isPending) {
    return (
      <View
        accessibilityLabel="Loading Grocery Agent"
        accessibilityRole="progressbar"
        className="flex-1 items-center justify-center gap-3 bg-background p-7"
      >
        <Spinner size="lg" />
        <Text variant="muted">Loading Grocery Agent…</Text>
      </View>
    );
  }

  if (session.isError && !session.data) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-7">
        <ErrorAlert message={readableError(session.error)} />
        <Button size="lg" variant="secondary" onPress={() => void session.refetch()}>
          Try again
        </Button>
      </View>
    );
  }

  return (
    <CopilotKitProvider runtimeUrl={runtimeUrl} headers={headers} useSingleEndpoint={false}>
      <GroceryAgentProvider>{children}</GroceryAgentProvider>
    </CopilotKitProvider>
  );
}
