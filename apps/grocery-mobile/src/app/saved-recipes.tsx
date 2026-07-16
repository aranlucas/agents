import { useRouter } from "expo-router";
import { BookMarked } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/theme";

export default function SavedRecipesScreen() {
  const router = useRouter();

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <View style={styles.icon}>
        <BookMarked color={colors.green} size={32} strokeWidth={2} />
      </View>
      <Text className="text-center font-extrabold" selectable variant="h3">
        No saved recipes yet
      </Text>
      <Text className="max-w-80 text-center leading-6 text-muted-foreground" selectable>
        Recipes you save will stay here so you can quickly build the grocery list again.
      </Text>
      <Button size="lg" variant="secondary" onPress={() => router.replace("/")}>
        Plan a recipe
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    marginBottom: 4,
  },
});
