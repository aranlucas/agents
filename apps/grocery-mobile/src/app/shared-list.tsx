import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { ListPlus, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RefreshControl } from "@/components/ui/refresh-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type GroceryList } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";
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
  const listsKey = groceryQueryKeys.lists(userId, householdId);
  const createListInFlight = useRef(false);
  const addItemInFlight = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedListId, setSelectedListId] = useState("");
  const [newListTitle, setNewListTitle] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const listsQuery = useQuery({
    queryKey: listsKey,
    queryFn: () => api.listLists(householdId),
    enabled: isFocused && Boolean(householdId),
  });
  const lists = listsQuery.data ?? [];
  const selectedList =
    lists.find((list) => list.id === selectedListId) ??
    lists.find((list) => list.status === "active") ??
    lists[0];
  const activeListId = selectedList?.id ?? "";
  const listKey = groceryQueryKeys.list(userId, activeListId);
  const activeListQuery = useQuery({
    queryKey: listKey,
    queryFn: () => api.getList(activeListId),
    enabled: isFocused && Boolean(activeListId),
  });
  const activeList = activeListQuery.data ?? selectedList ?? null;
  const { refetch: refetchLists } = listsQuery;
  const { refetch: refetchActiveList } = activeListQuery;

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  const createList = useMutation({
    mutationFn: (title: string) => api.createList(title, householdId),
    onSuccess: (created) => {
      setNewListTitle("");
      setSelectedListId(created.id);
      queryClient.setQueryData<GroceryList[]>(listsKey, (current = []) => [created, ...current]);
      queryClient.setQueryData(groceryQueryKeys.list(userId, created.id), created);
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
        queryKey: groceryQueryKeys.list(userId, mutation.listId),
      });
    },
  });

  const submitCreateList = async () => {
    const title = newListTitle.trim();
    if (!title || !householdId || createListInFlight.current || createList.isPending) return;
    createListInFlight.current = true;
    try {
      await createList.mutateAsync(title);
    } catch {
      // Mutation state owns the user-visible error; keep the submitted input for retry.
    } finally {
      createListInFlight.current = false;
    }
  };

  const submitAddItem = async () => {
    const name = newItemName.trim();
    if (!name || !activeList || addItemInFlight.current || mutateItem.isPending) return;
    addItemInFlight.current = true;
    try {
      await mutateItem.mutateAsync({ type: "add", listId: activeList.id, name });
    } catch {
      // Mutation state owns the user-visible error; keep the submitted input for retry.
    } finally {
      addItemInFlight.current = false;
    }
  };

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
      className="w-full max-w-3xl flex-1 self-center bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 p-4.5 pb-10"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <View className="gap-1 px-0.5">
        <Text className="font-extrabold text-primary" selectable variant="small">
          {householdName}
        </Text>
        <Text className="font-extrabold tracking-normal" variant="h3">
          Shared grocery lists
        </Text>
        <Text variant="muted">Changes are visible to everyone in this household.</Text>
      </View>

      {lists.length > 1 ? (
        <ScrollView
          accessibilityLabel="Grocery list selector"
          accessibilityRole="radiogroup"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-px"
        >
          {lists.map((list) => {
            const selected = list.id === activeList?.id;
            return (
              <Chip
                accessibilityState={{ checked: selected }}
                role="radio"
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
          <Card className="overflow-hidden rounded-2xl p-0">
            <CardHeader className="flex-row items-center justify-between gap-3 p-4">
              <View className="flex-1 gap-0.5">
                <CardTitle className="text-lg font-extrabold tracking-normal" selectable>
                  {activeList.title}
                </CardTitle>
                <CardDescription>
                  {activeList.items.length} {activeList.items.length === 1 ? "item" : "items"}
                </CardDescription>
              </View>
              <Icon as={ListPlus} className="size-5.5 text-primary" />
            </CardHeader>
            <CardContent className="p-0">
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
                              "font-bold",
                              checked && "text-muted-foreground line-through",
                            )}
                            selectable
                            variant="large"
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
                <EmptyState
                  className="p-4"
                  description="Add the first grocery item below."
                  icon={<Icon as={ListPlus} className="size-6 text-primary" />}
                  title="No items yet"
                />
              )}
            </CardContent>
          </Card>

          <View className="flex-row items-center gap-2.5">
            <Input
              accessibilityLabel="New grocery item"
              className="min-h-12 flex-1 rounded-2xl bg-card px-4 text-base"
              onChangeText={setNewItemName}
              onSubmitEditing={() => void submitAddItem()}
              placeholder="Add an item"
              returnKeyType="done"
              value={newItemName}
            />
            <Button
              accessibilityLabel="Add item"
              className="size-12 rounded-2xl"
              disabled={!newItemName.trim() || busy === "add-item"}
              icon={<Icon as={Plus} className="size-5.5 text-primary-foreground" />}
              loading={busy === "add-item"}
              onPress={() => void submitAddItem()}
              size="icon"
            />
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
        <Card className="rounded-2xl p-0">
          <CardHeader className="p-5 pb-0">
            <EmptyState
              className="p-0"
              description={`Create the first list for ${householdName}.`}
              icon={<Icon as={ListPlus} className="size-7 text-primary" />}
              title="Start a shared list"
            />
          </CardHeader>
          <CardContent className="p-5">
            <Input
              accessibilityLabel="List title"
              autoCapitalize="words"
              className="min-h-12 rounded-2xl bg-card px-4 text-base"
              onChangeText={setNewListTitle}
              onSubmitEditing={() => void submitCreateList()}
              placeholder={`${householdName} groceries`}
              returnKeyType="done"
              value={newListTitle}
            />
          </CardContent>
          <CardFooter className="p-5 pt-0">
            <Button
              className="flex-1"
              disabled={!newListTitle.trim() || busy === "create-list"}
              loading={busy === "create-list"}
              size="lg"
              onPress={() => void submitCreateList()}
            >
              Create shared list
            </Button>
          </CardFooter>
        </Card>
      )}

      {errorMessage ? <Alert title={errorMessage} variant="destructive" /> : null}
    </ScrollView>
  );
}
