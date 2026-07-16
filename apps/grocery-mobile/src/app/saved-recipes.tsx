import { useRouter } from "expo-router";
import { BookMarked } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SecondaryButton } from "@/components/ui";
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
      <Text selectable style={styles.title}>
        No saved recipes yet
      </Text>
      <Text selectable style={styles.body}>
        Recipes you save will stay here so you can quickly build the grocery list again.
      </Text>
      <SecondaryButton onPress={() => router.replace("/")}>Plan a recipe</SecondaryButton>
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
  title: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: "800" },
  body: {
    maxWidth: 330,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 8,
  },
});
