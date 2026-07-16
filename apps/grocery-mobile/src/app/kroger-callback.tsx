import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { readableError } from "@/lib/auth";
import { hasKrogerConnection } from "@/lib/connections";
import { colors } from "@/lib/theme";

export default function KrogerCallbackScreen() {
  const router = useRouter();
  const { isLoaded, user } = useUser();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded || !user) return;
    let active = true;
    void (async () => {
      try {
        // The auth-session owner consumes Clerk's one-time nonce. This route only waits for
        // the refreshed external account so both screens cannot race to use the same token.
        for (const delay of [250, 500, 1_000, 1_500, 2_000]) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (!active) return;
          const refreshedUser = await user.reload();
          if (!active) return;
          if (hasKrogerConnection(refreshedUser.externalAccounts)) {
            router.replace("/");
            return;
          }
        }
        throw new Error("Kroger returned without completing the account connection.");
      } catch (caught) {
        if (active) setError(readableError(caught));
      }
    })();
    return () => {
      active = false;
    };
  }, [isLoaded, router, user]);

  return (
    <View style={styles.screen}>
      {error ? (
        <>
          <Text style={styles.title}>Couldn’t finish connecting Kroger</Text>
          <Text style={styles.text}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/")}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Back to Grocery Agent</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.green} size="large" />
          <Text style={styles.text}>Finishing your Kroger connection…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    backgroundColor: colors.background,
    padding: 28,
  },
  title: { color: colors.ink, fontSize: 20, fontWeight: "700", textAlign: "center" },
  text: { color: colors.muted, fontSize: 15, textAlign: "center" },
  button: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: colors.green,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "700" },
});
