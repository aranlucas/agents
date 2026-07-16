import { Stack, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { UserRound } from "lucide-react-native";
import { GroceryChat } from "@/components/grocery-chat";
import { BrandMark } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
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
              <Text className="text-xl font-extrabold">Grocery Agent</Text>
            </View>
          ),
          headerRight: () => (
            <Button
              accessibilityLabel="Account"
              className="rounded-full"
              onPress={() => router.push("/account")}
              size="icon"
              variant="outline"
            >
              <UserRound color={colors.forest} size={21} />
            </Button>
          ),
        }}
      />
      <GroceryChat />
    </>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
});
