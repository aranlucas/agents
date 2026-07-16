import { useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export default function KrogerCallbackScreen() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    let active = true;
    void user?.reload().finally(() => {
      if (active) router.replace("/");
    });
    return () => {
      active = false;
    };
  }, [router, user]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.green} size="large" />
      <Text style={styles.text}>Finishing your Kroger connection…</Text>
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
  },
  text: { color: colors.muted, fontSize: 15 },
});
