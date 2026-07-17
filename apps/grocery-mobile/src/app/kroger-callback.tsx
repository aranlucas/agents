import { useUser } from "@clerk/clerk-expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { readableError } from "@/lib/auth";
import { waitForKrogerConnection } from "@/lib/connections";
import { groceryQueryKeys } from "@/lib/query-keys";

export default function KrogerCallbackScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, user } = useUser();
  const connection = useQuery({
    queryKey: groceryQueryKeys.krogerCallback(user?.id),
    queryFn: async ({ signal }) => {
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      // The auth-session owner consumes Clerk's one-time nonce. This route only waits for
      // the refreshed external account so both screens cannot race to use the same token.
      return waitForKrogerConnection({ reload: () => user.reload(), signal });
    },
    enabled: isLoaded && Boolean(user),
    retry: false,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!connection.data || !user) return;
    queryClient.setQueryData(groceryQueryKeys.krogerConnection(user.id), connection.data);
    router.replace("/");
  }, [connection.data, queryClient, router, user]);

  const error = connection.error ? readableError(connection.error) : "";

  return (
    <View className="flex-1 items-center justify-center gap-3.5 bg-background p-7">
      {error ? (
        <>
          <Text className="text-center font-bold" variant="h4">
            Couldn’t finish connecting Kroger
          </Text>
          <Text className="text-center text-muted-foreground" selectable>
            {error}
          </Text>
          <Button className="mt-2" size="lg" onPress={() => router.replace("/")}>
            Back to Grocery Agent
          </Button>
        </>
      ) : (
        <>
          <Spinner size="lg" />
          <Text className="text-center text-muted-foreground">
            Finishing your Kroger connection…
          </Text>
        </>
      )}
    </View>
  );
}
