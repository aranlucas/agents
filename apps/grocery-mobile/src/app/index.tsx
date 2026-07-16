import { Stack, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { UserRound } from "lucide-react-native";
import { GroceryChat } from "@/components/grocery-chat";
import { BrandMark } from "@/components/ui";
import { colors } from "@/lib/theme";

export default function GroceryHomeScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.brand}>
              <BrandMark size={34} />
              <Text style={styles.brandText}>Grocery Agent</Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              accessibilityLabel="Account"
              accessibilityRole="button"
              onPress={() => router.push("/account")}
              style={styles.account}
            >
              <UserRound color={colors.forest} size={21} />
            </Pressable>
          ),
        }}
      />
      <GroceryChat />
    </>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandText: { color: colors.ink, fontSize: 19, lineHeight: 24, fontWeight: "800" },
  account: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
});
