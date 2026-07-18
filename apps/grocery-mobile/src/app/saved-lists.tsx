import { useAuth } from "@clerk/clerk-expo";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronRight, ListChecks } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";

export default function SavedListsScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const personalQuery = useQuery({
    queryKey: groceryQueryKeys.lists(userId, null),
    queryFn: () => api.listLists(),
    enabled: Boolean(userId),
  });
  const householdsQuery = useQuery({
    queryKey: groceryQueryKeys.households(userId),
    queryFn: api.listHouseholds,
    enabled: Boolean(userId),
  });
  const householdQueries = useQueries({
    queries: (householdsQuery.data ?? []).map((household) => ({
      queryKey: groceryQueryKeys.lists(userId, household.id),
      queryFn: () => api.listLists(household.id),
      enabled: Boolean(userId),
    })),
  });
  const lists = [
    ...(personalQuery.data ?? []).map((list) => ({ list, location: "Personal" })),
    ...householdQueries.flatMap((query, index) =>
      (query.data ?? []).map((list) => ({
        list,
        location: householdsQuery.data?.[index]?.name ?? "Household",
      })),
    ),
  ];
  const queryError =
    personalQuery.error ??
    householdsQuery.error ??
    householdQueries.find((query) => query.error)?.error;

  return (
    <Screen className="bg-background">
      <View className="flex-row items-center justify-between gap-3 px-0.5">
        <View className="flex-1 gap-1">
          <Text className="font-extrabold tracking-normal" variant="h3">
            Saved grocery lists
          </Text>
          <Text variant="muted">Open a personal or household list to edit its items.</Text>
        </View>
        <Badge variant="outline">{String(lists.length)}</Badge>
      </View>

      {queryError instanceof Error ? (
        <Alert title={queryError.message} variant="destructive" />
      ) : null}
      {personalQuery.isPending || householdsQuery.isPending ? (
        <View accessibilityLabel="Loading saved grocery lists" className="gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </View>
      ) : lists.length ? (
        lists.map(({ list, location }) => (
          <Pressable
            accessibilityRole="button"
            key={list.id}
            onPress={() => router.push({ pathname: "/saved-list", params: { listId: list.id } })}
          >
            <Card className="rounded-2xl p-0 active:bg-muted">
              <CardHeader className="flex-row items-center gap-3 p-4">
                <View className="size-11 items-center justify-center rounded-2xl bg-muted">
                  <Icon as={ListChecks} className="size-5 text-primary" />
                </View>
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-2">
                    <CardTitle className="flex-1 text-lg font-extrabold tracking-normal">
                      {list.title}
                    </CardTitle>
                    <Badge variant="outline">{location}</Badge>
                  </View>
                  <CardDescription>
                    Updated {new Date(list.updated_at).toLocaleDateString()}
                  </CardDescription>
                </View>
                <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Pressable>
        ))
      ) : (
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
