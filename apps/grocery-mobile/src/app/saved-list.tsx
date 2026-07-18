import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Plus, Save, Trash2 } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { Pressable, View } from "react-native";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormInput } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function SavedListScreen() {
  const listId = firstParam(useLocalSearchParams<{ listId?: string | string[] }>().listId);
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const queryClient = useQueryClient();
  const listKey = groceryQueryKeys.list(userId, listId);
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => api.getList(listId),
    enabled: Boolean(listId),
  });
  const { control, getValues, resetField, setValue, trigger } = useForm<{
    title: string;
    newItem: string;
  }>({ defaultValues: { title: "", newItem: "" } });
  const list = listQuery.data;
  useEffect(() => {
    if (list) setValue("title", list.title);
  }, [list, setValue]);
  const mutateList = useMutation({
    mutationFn: async (
      mutation:
        | { type: "title"; title: string }
        | { type: "add"; name: string }
        | { type: "toggle"; itemId: string; checked: boolean }
        | { type: "delete"; itemId: string },
    ) => {
      switch (mutation.type) {
        case "title":
          return api.updateList(listId, { title: mutation.title });
        case "add":
          await api.addItems(listId, [{ name: mutation.name }]);
          return undefined;
        case "toggle":
          await api.updateItem(listId, mutation.itemId, { checked: mutation.checked });
          return undefined;
        case "delete":
          await api.deleteItem(listId, mutation.itemId);
          return undefined;
      }
    },
    onSuccess: async (_, mutation) => {
      if (mutation.type === "add") resetField("newItem");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({
          queryKey: groceryQueryKeys.lists(userId, list?.household_id),
        }),
      ]);
    },
  });
  const saveTitle = async () => {
    if (await trigger("title")) {
      mutateList.mutate({ type: "title", title: getValues("title").trim() });
    }
  };
  const addItem = async () => {
    if (await trigger("newItem")) {
      mutateList.mutate({ type: "add", name: getValues("newItem").trim() });
    }
  };

  if (listQuery.isPending) {
    return (
      <View className="w-full max-w-3xl flex-1 gap-4 self-center bg-background p-4 sm:p-6">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </View>
    );
  }
  if (listQuery.error instanceof Error || !list) {
    return (
      <View className="w-full max-w-3xl flex-1 justify-center self-center bg-background p-4 sm:p-6">
        <Alert
          title={listQuery.error instanceof Error ? listQuery.error.message : "List not found"}
          variant="destructive"
        />
      </View>
    );
  }

  return (
    <Screen className="bg-background">
      <View className="gap-2">
        <Text className="font-extrabold tracking-normal" variant="h3">
          Edit grocery list
        </Text>
        <View className="flex-row items-center gap-2">
          <FormInput
            accessibilityLabel="Grocery list title"
            className="flex-1"
            containerClassName="flex-1"
            control={control}
            name="title"
            rules={{ validate: (value) => value.trim().length > 0 || "Add a title." }}
          />
          <Button
            accessibilityLabel="Save list title"
            className="size-14"
            disabled={mutateList.isPending}
            icon={<Icon as={Save} className="size-4.5 text-primary-foreground" />}
            onPress={() => void saveTitle()}
            size="icon"
          />
        </View>
      </View>

      <Card className="overflow-hidden rounded-2xl p-0">
        <CardHeader className="p-4">
          <CardTitle className="text-lg font-extrabold tracking-normal">
            {list.items.length} {list.items.length === 1 ? "item" : "items"}
          </CardTitle>
          <CardDescription>Changes sync with Grocery Agent and authorized members.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {list.items.map((item, index) => {
            const checked = Boolean(item.checked_at);
            return (
              <View key={item.id}>
                <View className="min-h-16 flex-row items-center px-4">
                  <Checkbox
                    accessibilityLabel={`${checked ? "Uncheck" : "Check"} ${item.name}`}
                    checked={checked}
                    onCheckedChange={(next) =>
                      mutateList.mutate({ type: "toggle", itemId: item.id, checked: next })
                    }
                  />
                  <View className="flex-1 gap-0.5 py-3">
                    <Text
                      className={cn("font-bold", checked && "text-muted-foreground line-through")}
                      variant="large"
                    >
                      {item.name}
                    </Text>
                    <Text variant="muted">Quantity {item.quantity}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Remove ${item.name}`}
                    accessibilityRole="button"
                    className="min-h-14 min-w-14 items-center justify-center active:opacity-60"
                    onPress={() => mutateList.mutate({ type: "delete", itemId: item.id })}
                  >
                    <Icon as={Trash2} className="size-5 text-muted-foreground" />
                  </Pressable>
                </View>
                {index < list.items.length - 1 ? <View className="ml-13 h-px bg-border" /> : null}
              </View>
            );
          })}
        </CardContent>
      </Card>

      <View className="flex-row items-center gap-2">
        <FormInput
          accessibilityLabel="New grocery item"
          className="flex-1"
          containerClassName="flex-1"
          control={control}
          name="newItem"
          onSubmitEditing={() => void addItem()}
          placeholder="Add an item"
          returnKeyType="done"
          rules={{ validate: (value) => value.trim().length > 0 || "Add an item." }}
        />
        <Button
          accessibilityLabel="Add grocery item"
          className="size-14"
          disabled={mutateList.isPending}
          icon={<Icon as={Plus} className="size-5 text-primary-foreground" />}
          onPress={() => void addItem()}
          size="icon"
        />
      </View>

      {mutateList.error instanceof Error ? (
        <Alert title={mutateList.error.message} variant="destructive" />
      ) : null}
    </Screen>
  );
}
