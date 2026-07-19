import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Plus, Save, Trash2 } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormInput, FormTextarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type RecipeContent } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

type RecipeFormValues = Omit<RecipeContent, "tags"> & { tags: string };

const EMPTY_RECIPE_FORM: RecipeFormValues = {
  title: "",
  description: "",
  servings: "",
  notes: "",
  ingredients: [],
  steps: [],
  tags: "",
};

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
  const values = useMemo<RecipeFormValues>(() => {
    const recipe = recipeQuery.data;
    if (!recipe) return EMPTY_RECIPE_FORM;
    return {
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
      tags: recipe.tags.join(", "),
    };
  }, [recipeQuery.data]);
  const { control, handleSubmit, setValue } = useForm<RecipeFormValues>({ values });
  const ingredients = useFieldArray({ control, name: "ingredients" });
  const steps = useWatch({ control, name: "steps" }) ?? [];

  const updateRecipe = useMutation({
    mutationFn: (content: RecipeContent) => api.updateRecipe(recipeId, content),
    onSuccess: async (recipe) => {
      queryClient.setQueryData(recipeKey, recipe);
      await queryClient.invalidateQueries({
        queryKey: groceryQueryKeys.recipes(userId, recipe.household_id),
      });
    },
  });
  const submit = handleSubmit((draft) =>
    updateRecipe.mutate({
      ...draft,
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    }),
  );

  if (!recipeId) {
    return (
      <Screen contentContainerClassName="flex-grow justify-center">
        <Alert
          title="This saved recipe link is incomplete. Go back and open it again."
          variant="destructive"
        />
      </Screen>
    );
  }

  if (recipeQuery.error instanceof Error) {
    return (
      <Screen contentContainerClassName="flex-grow justify-center">
        <Alert title={recipeQuery.error.message} variant="destructive" />
      </Screen>
    );
  }

  if (recipeQuery.isPending || !recipeQuery.data) {
    return (
      <Screen>
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text selectable variant="muted">
        Changes are available to Grocery Agent and every authorized household member.
      </Text>

      <Card className="p-0">
        <CardContent className="gap-3 p-4">
          <FormInput
            accessibilityLabel="Recipe title"
            control={control}
            label="Title"
            name="title"
            placeholder="Recipe title"
            rules={{ validate: (value) => value.trim().length > 0 || "Add a recipe title." }}
          />
          <FormTextarea
            accessibilityLabel="Recipe description"
            control={control}
            label="Description"
            name="description"
            placeholder="Short description"
          />
          <FormInput
            accessibilityLabel="Recipe servings"
            control={control}
            label="Servings"
            name="servings"
            placeholder="Servings"
          />
          <FormInput
            accessibilityLabel="Recipe tags"
            control={control}
            label="Tags"
            name="tags"
            placeholder="Tags, separated by commas"
          />
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardHeader className="flex-row items-center justify-between p-4 pb-2">
          <CardTitle>Ingredients</CardTitle>
          <Button
            icon={<Icon as={Plus} className="size-4 text-secondary-foreground" />}
            onPress={() => ingredients.append({ name: "", note: "", quantity: "", unit: "" })}
            size="sm"
            variant="secondary"
          >
            Add
          </Button>
        </CardHeader>
        <CardContent className="gap-3 p-4 pt-2">
          {ingredients.fields.map((ingredient, index) => (
            <View className="gap-2 rounded-2xl bg-muted p-3" key={ingredient.id}>
              <View className="flex-row items-center gap-2">
                <FormInput
                  accessibilityLabel={`Ingredient ${index + 1}`}
                  containerClassName="flex-1"
                  control={control}
                  name={`ingredients.${index}.name`}
                  placeholder="Ingredient"
                  rules={{ validate: (value) => value.trim().length > 0 || "Add an ingredient." }}
                />
                <Pressable
                  accessibilityLabel={`Remove ingredient ${index + 1}`}
                  accessibilityRole="button"
                  className="min-h-14 min-w-14 items-center justify-center active:opacity-60"
                  onPress={() => ingredients.remove(index)}
                >
                  <Icon as={Trash2} className="size-5 text-muted-foreground" />
                </Pressable>
              </View>
              <View className="flex-col gap-2 sm:flex-row">
                <FormInput
                  accessibilityLabel={`Ingredient ${index + 1} quantity`}
                  containerClassName="w-full sm:flex-1"
                  control={control}
                  name={`ingredients.${index}.quantity`}
                  placeholder="Quantity"
                />
                <FormInput
                  accessibilityLabel={`Ingredient ${index + 1} unit`}
                  containerClassName="w-full sm:flex-1"
                  control={control}
                  name={`ingredients.${index}.unit`}
                  placeholder="Unit"
                />
              </View>
              <FormInput
                accessibilityLabel={`Ingredient ${index + 1} note`}
                control={control}
                name={`ingredients.${index}.note`}
                placeholder="Note (optional)"
              />
            </View>
          ))}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardHeader className="flex-row items-center justify-between p-4 pb-2">
          <CardTitle>Steps</CardTitle>
          <Button
            icon={<Icon as={Plus} className="size-4 text-secondary-foreground" />}
            onPress={() => setValue("steps", [...steps, ""], { shouldDirty: true })}
            size="sm"
            variant="secondary"
          >
            Add
          </Button>
        </CardHeader>
        <CardContent className="gap-3 p-4 pt-2">
          {steps.map((_, index) => (
            <View className="flex-row items-start gap-2" key={`step-${index}`}>
              <View className="mt-2 size-7 items-center justify-center rounded-full bg-muted">
                <Text className="font-bold" variant="small">
                  {String(index + 1)}
                </Text>
              </View>
              <FormTextarea
                accessibilityLabel={`Step ${index + 1}`}
                className="flex-1"
                containerClassName="flex-1"
                control={control}
                name={`steps.${index}`}
                placeholder="Instruction"
                rules={{ validate: (value) => value.trim().length > 0 || "Add an instruction." }}
              />
              <Pressable
                accessibilityLabel={`Remove step ${index + 1}`}
                accessibilityRole="button"
                className="mt-2 min-h-14 min-w-14 items-center justify-center active:opacity-60"
                onPress={() =>
                  setValue(
                    "steps",
                    steps.filter((_, currentIndex) => currentIndex !== index),
                    { shouldDirty: true },
                  )
                }
              >
                <Icon as={Trash2} className="size-5 text-muted-foreground" />
              </Pressable>
            </View>
          ))}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="p-4">
          <FormTextarea
            accessibilityLabel="Recipe notes"
            control={control}
            label="Notes"
            name="notes"
            placeholder="Notes"
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
        onPress={() => void submit()}
        size="lg"
      >
        Save changes
      </Button>
    </Screen>
  );
}
