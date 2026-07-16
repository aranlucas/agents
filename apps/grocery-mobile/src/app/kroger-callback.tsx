import { useUser } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { readableError } from "@/lib/auth";
import { hasKrogerConnection } from "@/lib/connections";
import { colors } from "@/lib/theme";

export default function KrogerCallbackScreen() {
  const router = useRouter();
  const callbackUrl = Linking.useURL();
  const { isLoaded, user } = useUser();
  const { rotating_token_nonce: rotatingTokenNonceParam } = useLocalSearchParams<{
    rotating_token_nonce?: string | string[];
  }>();
  const [error, setError] = useState("");
  const rotatingTokenNonce = Array.isArray(rotatingTokenNonceParam)
    ? rotatingTokenNonceParam[0]
    : rotatingTokenNonceParam;

  useEffect(() => {
    if (!callbackUrl) return;
    const parsed = new URL(callbackUrl);
    console.warn("Kroger callback URL metadata", {
      protocol: parsed.protocol,
      host: parsed.host,
      pathname: parsed.pathname,
      queryKeys: [...parsed.searchParams.keys()],
      hashKeys: [...new URLSearchParams(parsed.hash.slice(1)).keys()],
    });
  }, [callbackUrl]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    let active = true;
    void (async () => {
      try {
        if (!rotatingTokenNonce) {
          throw new Error("Kroger returned without the account verification token.");
        }
        const refreshedUser = await user.reload({ rotatingTokenNonce });
        if (!hasKrogerConnection(refreshedUser.externalAccounts)) {
          throw new Error("Kroger returned without completing the account connection.");
        }
        if (active) router.replace("/");
      } catch (caught) {
        if (active) setError(readableError(caught));
      }
    })();
    return () => {
      active = false;
    };
  }, [isLoaded, rotatingTokenNonce, router, user]);

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
