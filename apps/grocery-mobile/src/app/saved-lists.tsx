import { useRouter } from "expo-router";
import { ChevronRight, ListChecks } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useSavedResources } from "@/hooks/use-saved-resources";
import { groceryQueryKeys } from "@/lib/query-keys";

export default function SavedListsScreen() {
  const router = useRouter();
  const {
    resources: lists,
    queryError,
    loading,
  } = useSavedResources({
    queryKey: groceryQueryKeys.lists,
    load: (api, householdId) => api.listLists(householdId),
  });

  return (
    <Screen>
      <View className="flex-row items-center gap-3">
        <Text className="flex-1" variant="muted">
          Open a personal or household list to edit its items.
        </Text>
        <Badge accessible accessibilityLabel={`${lists.length} saved lists`} variant="outline">
          {String(lists.length)}
        </Badge>
      </View>

      {queryError instanceof Error ? (
        <Alert title={queryError.message} variant="destructive" />
      ) : null}
      {loading ? (
        <View accessibilityLabel="Loading saved grocery lists" className="gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </View>
      ) : lists.length ? (
        lists.map(({ resource: list, location }) => (
          <Pressable
            accessibilityLabel={`${list.title}, ${location}`}
            accessibilityRole="button"
            className="active:opacity-80"
            key={list.id}
            onPress={() => router.push({ pathname: "/saved-list", params: { listId: list.id } })}
          >
            <Card className="p-0">
              <CardHeader className="flex-row items-center gap-3 p-4">
                <View className="size-11 items-center justify-center rounded-md bg-muted">
                  <Icon as={ListChecks} className="size-5 text-primary" />
                </View>
                <View className="flex-1 gap-1">
                  <CardTitle>{list.title}</CardTitle>
                  <CardDescription>
                    {location} · Updated {new Date(list.updated_at).toLocaleDateString()}
                  </CardDescription>
                </View>
                <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Pressable>
        ))
      ) : queryError instanceof Error ? null : (
        <EmptyState
          action={{ label: "Create a list", onPress: () => router.replace("/chat") }}
          className="min-h-72"
          description="Lists you explicitly save from chat will appear here."
          icon={<Icon as={ListChecks} className="size-8 text-primary" />}
          title="No saved lists yet"
        />
      )}
    </Screen>
  );
}
