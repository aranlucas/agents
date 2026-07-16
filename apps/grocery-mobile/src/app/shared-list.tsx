import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { ListPlus, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RefreshControl } from "@/components/ui/refresh-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type GroceryList } from "@/lib/household-api";
import { cn } from "@/lib/utils";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

type ItemMutation =
  | { type: "add"; listId: string; name: string }
  | { type: "toggle"; listId: string; itemId: string; checked: boolean }
  | { type: "delete"; listId: string; itemId: string };

export default function SharedListScreen() {
  const params = useLocalSearchParams<{
    householdId?: string | string[];
    householdName?: string | string[];
  }>();
  const householdId = firstParam(params.householdId);
  const householdName = firstParam(params.householdName) || "Household";
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const queryClient = useQueryClient();
  const listsKey = ["grocery-lists", userId, householdId] as const;
  const [selectedListId, setSelectedListId] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const listsQuery = useQuery({
    queryKey: listsKey,
    queryFn: () => api.listLists(householdId),
    enabled: Boolean(householdId),
  });
  const lists = listsQuery.data ?? [];
  const selectedList =
    lists.find((list) => list.id === selectedListId) ??
    lists.find((list) => list.status === "active") ??
    lists[0];
  const activeListId = selectedList?.id ?? "";
  const listKey = ["grocery-list", userId, activeListId] as const;
  const activeListQuery = useQuery({
    queryKey: listKey,
    queryFn: () => api.getList(activeListId),
    enabled: Boolean(activeListId),
  });
  const activeList = activeListQuery.data ?? selectedList ?? null;
  const { refetch: refetchLists } = listsQuery;
  const { refetch: refetchActiveList } = activeListQuery;

  useFocusEffect(
    useCallback(() => {
      void refetchLists();
      if (activeListId) void refetchActiveList();
    }, [activeListId, refetchActiveList, refetchLists]),
  );

  const createList = useMutation({
    mutationFn: (title: string) => api.createList(title, householdId),
    onSuccess: (created) => {
      setNewListTitle("");
      setSelectedListId(created.id);
      queryClient.setQueryData<GroceryList[]>(listsKey, (current = []) => [created, ...current]);
      queryClient.setQueryData(["grocery-list", userId, created.id], created);
    },
  });

  const mutateItem = useMutation({
    mutationFn: async (mutation: ItemMutation) => {
      switch (mutation.type) {
        case "add":
          return api.addItems(mutation.listId, [{ name: mutation.name }]);
        case "toggle":
          return api.updateItem(mutation.listId, mutation.itemId, { checked: mutation.checked });
        case "delete":
          return api.deleteItem(mutation.listId, mutation.itemId);
      }
    },
    onSuccess: async (_, mutation) => {
      if (mutation.type === "add") setNewItemName("");
      await queryClient.invalidateQueries({
        queryKey: ["grocery-list", userId, mutation.listId],
      });
    },
  });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchLists(), activeListId ? refetchActiveList() : Promise.resolve()]);
    setRefreshing(false);
  };
  const mutationError = createList.error ?? mutateItem.error;
  const error = listsQuery.error ?? activeListQuery.error ?? mutationError;
  const errorMessage = !householdId
    ? "This household link is incomplete. Go back and open it again."
    : error instanceof Error
      ? error.message
      : error
        ? "The shared list request failed."
        : "";
  const busy = createList.isPending
    ? "create-list"
    : mutateItem.isPending
      ? mutateItem.variables.type === "add"
        ? "add-item"
        : `item:${mutateItem.variables.itemId}`
      : "";
  const loading =
    Boolean(householdId) &&
    (listsQuery.isPending || (Boolean(activeListId) && activeListQuery.isPending));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 p-4.5 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <View className="gap-1 px-0.5">
        <Text className="text-sm font-extrabold text-primary" selectable>
          {householdName}
        </Text>
        <Text className="text-2xl font-extrabold">Shared grocery lists</Text>
        <Text className="text-sm text-muted-foreground">
          Changes are visible to everyone in this household.
        </Text>
      </View>

      {lists.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-px"
        >
          {lists.map((list) => {
            const selected = list.id === activeList?.id;
            return (
              <Chip
                accessibilityRole="button"
                key={list.id}
                onPress={() => setSelectedListId(list.id)}
                selected={selected}
              >
                {list.title}
              </Chip>
            );
          })}
        </ScrollView>
      ) : null}

      {activeList ? (
        <>
          <Card className="gap-0 overflow-hidden rounded-2xl p-0">
            <View className="flex-row items-center justify-between gap-3 p-4">
              <View className="flex-1 gap-0.5">
                <Text className="text-lg font-extrabold" selectable>
                  {activeList.title}
                </Text>
                <Text variant="muted">
                  {activeList.items.length} {activeList.items.length === 1 ? "item" : "items"}
                </Text>
              </View>
              <Icon as={ListPlus} className="size-5.5 text-primary" />
            </View>
            {activeList.items.length ? (
              activeList.items.map((item, index) => {
                const checked = Boolean(item.checked_at);
                const itemBusy = busy === `item:${item.id}`;
                return (
                  <View key={item.id}>
                    <View
                      className={cn(
                        "min-h-16 flex-row items-center px-4",
                        itemBusy && "opacity-50",
                      )}
                    >
                      <Checkbox
                        accessibilityLabel={`${checked ? "Uncheck" : "Check"} ${item.name}`}
                        checked={checked}
                        disabled={itemBusy}
                        onCheckedChange={(nextChecked) =>
                          mutateItem.mutate({
                            type: "toggle",
                            listId: activeList.id,
                            itemId: item.id,
                            checked: nextChecked,
                          })
                        }
                      />
                      <View className="flex-1 gap-0.5 py-3">
                        <Text
                          className={cn(
                            "text-sm font-bold",
                            checked && "text-muted-foreground line-through",
                          )}
                          selectable
                        >
                          {item.name}
                        </Text>
                        <Text variant="muted">Quantity {item.quantity}</Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Remove ${item.name}`}
                        accessibilityRole="button"
                        className="p-2.5 active:opacity-60"
                        disabled={itemBusy}
                        onPress={() =>
                          mutateItem.mutate({
                            type: "delete",
                            listId: activeList.id,
                            itemId: item.id,
                          })
                        }
                        hitSlop={10}
                      >
                        <Icon as={Trash2} className="size-5 text-muted-foreground" />
                      </Pressable>
                    </View>
                    {index < activeList.items.length - 1 ? (
                      <View className="ml-13 h-px bg-border" />
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text className="p-4 text-sm text-muted-foreground">
                No items yet. Add the first one below.
              </Text>
            )}
          </Card>

          <View className="flex-row items-center gap-2.5">
            <Input
              accessibilityLabel="New grocery item"
              className="min-h-12 flex-1 rounded-2xl bg-card px-4 text-base"
              onChangeText={setNewItemName}
              onSubmitEditing={() =>
                activeList &&
                mutateItem.mutate({
                  type: "add",
                  listId: activeList.id,
                  name: newItemName.trim(),
                })
              }
              placeholder="Add an item"
              returnKeyType="done"
              value={newItemName}
            />
            <Button
              accessibilityLabel="Add item"
              className="size-12 rounded-2xl"
              disabled={!newItemName.trim() || busy === "add-item"}
              loading={busy === "add-item"}
              onPress={() =>
                activeList &&
                mutateItem.mutate({
                  type: "add",
                  listId: activeList.id,
                  name: newItemName.trim(),
                })
              }
              size="icon"
            >
              <Icon as={Plus} className="size-5.5 text-primary-foreground" />
            </Button>
          </View>
        </>
      ) : loading ? (
        <View
          accessibilityLabel="Loading shared lists"
          accessibilityRole="progressbar"
          className="gap-3"
        >
          <Skeleton className="h-36 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </View>
      ) : (
        <Card className="items-stretch gap-3 rounded-2xl p-5">
          <Icon as={ListPlus} className="size-7 text-primary" />
          <Text className="text-xl font-extrabold">Start a shared list</Text>
          <Text className="text-sm text-muted-foreground">
            Create the first list for {householdName}.
          </Text>
          <Input
            accessibilityLabel="List title"
            autoCapitalize="words"
            className="min-h-12 rounded-2xl bg-card px-4 text-base"
            onChangeText={setNewListTitle}
            onSubmitEditing={() =>
              createList.mutate(newListTitle.trim() || `${householdName} groceries`)
            }
            placeholder={`${householdName} groceries`}
            returnKeyType="done"
            value={newListTitle}
          />
          <Button
            loading={busy === "create-list"}
            size="lg"
            onPress={() => createList.mutate(newListTitle.trim() || `${householdName} groceries`)}
          >
            Create shared list
          </Button>
        </Card>
      )}

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}
    </ScrollView>
  );
}
