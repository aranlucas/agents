import { useRouter } from "expo-router";
import { BookMarked } from "lucide-react-native";
import { ScrollView } from "react-native";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";

export default function SavedRecipesScreen() {
  const router = useRouter();

  return (
    <ScrollView
      className="w-full max-w-3xl flex-1 self-center bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="flex-grow items-center justify-center gap-3 p-7"
    >
      <EmptyState
        action={{ label: "Plan a recipe", onPress: () => router.replace("/chat") }}
        className="p-0"
        description="Recipes you save will stay here so you can quickly build the grocery list again."
        icon={<Icon as={BookMarked} className="size-8 text-primary" strokeWidth={2} />}
        title="No saved recipes yet"
      />
    </ScrollView>
  );
}
