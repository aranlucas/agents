import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Plus, Save, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { getRuntimeUrl } from "@/lib/config";
import {
  createHouseholdApi,
  type NewRecipeIngredient,
  type RecipeContent,
} from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function SavedRecipeScreen() {
  const recipeId = firstParam(useLocalSearchParams<{ recipeId?: string | string[] }>().recipeId);
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const queryClient = useQueryClient();
  const recipeKey = groceryQueryKeys.recipe(userId, recipeId);
  const recipeQuery = useQuery({
    queryKey: recipeKey,
    queryFn: () => api.getRecipe(recipeId),
    enabled: Boolean(recipeId),
  });
  const [draft, setDraft] = useState<RecipeContent>();

  useEffect(() => {
    const recipe = recipeQuery.data;
    if (!recipe) return;
    setDraft({
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      notes: recipe.notes,
      ingredients: recipe.ingredients.map(({ name, note, quantity, unit }) => ({
        name,
        note,
        quantity,
        unit,
      })),
      steps: recipe.steps.map((step) => step.instruction),
      tags: recipe.tags,
    });
  }, [recipeQuery.data]);

  const updateRecipe = useMutation({
    mutationFn: (content: RecipeContent) => api.updateRecipe(recipeId, content),
    onSuccess: async (recipe) => {
      queryClient.setQueryData(recipeKey, recipe);
      await queryClient.invalidateQueries({
        queryKey: groceryQueryKeys.recipes(userId, recipe.household_id),
      });
    },
  });

  if (recipeQuery.error instanceof Error) {
    return (
      <View className="w-full max-w-3xl flex-1 justify-center self-center bg-background p-5">
        <Alert title={recipeQuery.error.message} variant="destructive" />
      </View>
    );
  }

  if (recipeQuery.isPending || !draft) {
    return (
      <View className="w-full max-w-3xl flex-1 gap-4 self-center bg-background p-4.5">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </View>
    );
  }

  const updateIngredient = (index: number, patch: Partial<NewRecipeIngredient>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            ingredients: current.ingredients.map((ingredient, currentIndex) =>
              currentIndex === index ? { ...ingredient, ...patch } : ingredient,
            ),
          }
        : current,
    );
  };

  return (
    <ScrollView
      className="w-full max-w-3xl flex-1 self-center bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 p-4.5 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1 px-0.5">
        <Text className="font-extrabold tracking-normal" variant="h3">
          Edit recipe
        </Text>
        <Text variant="muted">
          Changes are available to Grocery Agent and every authorized household member.
        </Text>
      </View>

      <Card className="rounded-2xl p-0">
        <CardContent className="gap-3 p-4">
          <Input
            accessibilityLabel="Recipe title"
            onChangeText={(title) => setDraft((current) => current && { ...current, title })}
            placeholder="Recipe title"
            value={draft.title}
          />
          <Textarea
            accessibilityLabel="Recipe description"
            onChangeText={(description) =>
              setDraft((current) => current && { ...current, description })
            }
            placeholder="Short description"
            value={draft.description}
          />
          <Input
            accessibilityLabel="Recipe servings"
            onChangeText={(servings) => setDraft((current) => current && { ...current, servings })}
            placeholder="Servings"
            value={draft.servings}
          />
          <Input
            accessibilityLabel="Recipe tags"
            onChangeText={(tags) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      tags: tags
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    }
                  : current,
              )
            }
            placeholder="Tags, separated by commas"
            value={(draft.tags ?? []).join(", ")}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-0">
        <CardHeader className="flex-row items-center justify-between p-4 pb-2">
          <CardTitle className="text-lg font-extrabold tracking-normal">Ingredients</CardTitle>
          <Button
            icon={<Icon as={Plus} className="size-4 text-secondary-foreground" />}
            onPress={() =>
              setDraft((current) =>
                current
                  ? { ...current, ingredients: [...current.ingredients, { name: "" }] }
                  : current,
              )
            }
            size="sm"
            variant="secondary"
          >
            Add
          </Button>
        </CardHeader>
        <CardContent className="gap-3 p-4 pt-2">
          {draft.ingredients.map((ingredient, index) => (
            <View className="gap-2 rounded-2xl bg-muted p-3" key={`ingredient-${index}`}>
              <View className="flex-row items-center gap-2">
                <Input
                  accessibilityLabel={`Ingredient ${index + 1}`}
                  className="flex-1 bg-card"
                  onChangeText={(name) => updateIngredient(index, { name })}
                  placeholder="Ingredient"
                  value={ingredient.name}
                />
                <Pressable
                  accessibilityLabel={`Remove ingredient ${index + 1}`}
                  accessibilityRole="button"
                  className="p-2.5 active:opacity-60"
                  onPress={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            ingredients: current.ingredients.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          }
                        : current,
                    )
                  }
                >
                  <Icon as={Trash2} className="size-5 text-muted-foreground" />
                </Pressable>
              </View>
              <View className="flex-row gap-2">
                <Input
                  accessibilityLabel={`Ingredient ${index + 1} quantity`}
                  className="flex-1 bg-card"
                  onChangeText={(quantity) => updateIngredient(index, { quantity })}
                  placeholder="Quantity"
                  value={ingredient.quantity}
                />
                <Input
                  accessibilityLabel={`Ingredient ${index + 1} unit`}
                  className="flex-1 bg-card"
                  onChangeText={(unit) => updateIngredient(index, { unit })}
                  placeholder="Unit"
                  value={ingredient.unit}
                />
              </View>
            </View>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-0">
        <CardHeader className="flex-row items-center justify-between p-4 pb-2">
          <CardTitle className="text-lg font-extrabold tracking-normal">Steps</CardTitle>
          <Button
            icon={<Icon as={Plus} className="size-4 text-secondary-foreground" />}
            onPress={() =>
              setDraft((current) =>
                current ? { ...current, steps: [...current.steps, ""] } : current,
              )
            }
            size="sm"
            variant="secondary"
          >
            Add
          </Button>
        </CardHeader>
        <CardContent className="gap-3 p-4 pt-2">
          {draft.steps.map((step, index) => (
            <View className="flex-row items-start gap-2" key={`step-${index}`}>
              <View className="mt-2 size-7 items-center justify-center rounded-full bg-muted">
                <Text className="font-bold" variant="small">
                  {String(index + 1)}
                </Text>
              </View>
              <Textarea
                accessibilityLabel={`Step ${index + 1}`}
                className="flex-1"
                onChangeText={(instruction) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          steps: current.steps.map((value, currentIndex) =>
                            currentIndex === index ? instruction : value,
                          ),
                        }
                      : current,
                  )
                }
                placeholder="Instruction"
                value={step}
              />
              <Pressable
                accessibilityLabel={`Remove step ${index + 1}`}
                accessibilityRole="button"
                className="mt-2 p-2 active:opacity-60"
                onPress={() =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          steps: current.steps.filter((_, currentIndex) => currentIndex !== index),
                        }
                      : current,
                  )
                }
              >
                <Icon as={Trash2} className="size-5 text-muted-foreground" />
              </Pressable>
            </View>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-0">
        <CardContent className="p-4">
          <Textarea
            accessibilityLabel="Recipe notes"
            onChangeText={(notes) => setDraft((current) => current && { ...current, notes })}
            placeholder="Notes"
            value={draft.notes}
          />
        </CardContent>
      </Card>

      {updateRecipe.error instanceof Error ? (
        <Alert title={updateRecipe.error.message} variant="destructive" />
      ) : null}
      {updateRecipe.data ? <Alert title="Recipe changes saved" /> : null}
      <Button
        icon={<Icon as={Save} className="size-5 text-primary-foreground" />}
        loading={updateRecipe.isPending}
        onPress={() => updateRecipe.mutate(draft)}
        size="lg"
      >
        Save changes
      </Button>
    </ScrollView>
  );
}
