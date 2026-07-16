import { useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { readableError } from "@/lib/auth";
import { hasKrogerConnection } from "@/lib/connections";

export default function KrogerCallbackScreen() {
  const router = useRouter();
  const { isLoaded, user } = useUser();
  const connection = useQuery({
    queryKey: ["kroger-connection-callback", user?.id],
    queryFn: async () => {
      if (!user) throw new Error("Your session has expired. Please sign in again.");
      // The auth-session owner consumes Clerk's one-time nonce. This route only waits for
      // the refreshed external account so both screens cannot race to use the same token.
      const refreshedUser = await user.reload();
      if (!hasKrogerConnection(refreshedUser.externalAccounts)) {
        throw new Error("Kroger returned without completing the account connection.");
      }
      return refreshedUser;
    },
    enabled: isLoaded && Boolean(user),
    retry: 4,
    retryDelay: (attempt) => [250, 500, 1_000, 1_500, 2_000][attempt] ?? 2_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (connection.isSuccess) router.replace("/");
  }, [connection.isSuccess, router]);

  const error = connection.error ? readableError(connection.error) : "";

  return (
    <View className="flex-1 items-center justify-center gap-3.5 bg-background p-7">
      {error ? (
        <>
          <Text className="text-center text-xl font-bold">Couldn’t finish connecting Kroger</Text>
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
