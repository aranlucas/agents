import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BookMarked, ChevronRight, Plus, Save } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { SaveResourceDialog } from "@/components/save-resource-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useGroceryState } from "@/hooks/use-grocery-agent";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type Recipe } from "@/lib/household-api";
import { groceryQueryKeys } from "@/lib/query-keys";

export default function SavedRecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ save?: string | string[] }>();
  const requestSave = Array.isArray(params.save) ? params.save[0] : params.save;
  const { isRunning } = useGroceryAgent();
  const state = useGroceryState();
  const draft = state.recipe;
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(requestSave === "1" && Boolean(draft));
  const personalKey = groceryQueryKeys.recipes(userId);
  const personalQuery = useQuery({
    queryKey: personalKey,
    queryFn: () => api.listRecipes(),
    enabled: Boolean(userId),
  });
  const householdsQuery = useQuery({
    queryKey: groceryQueryKeys.households(userId),
    queryFn: api.listHouseholds,
    enabled: Boolean(userId),
  });
  const householdQueries = useQueries({
    queries: (householdsQuery.data ?? []).map((household) => ({
      queryKey: groceryQueryKeys.recipes(userId, household.id),
      queryFn: () => api.listRecipes(household.id),
      enabled: Boolean(userId),
    })),
  });
  const recipes = [
    ...(personalQuery.data ?? []).map((recipe) => ({ recipe, location: "Personal" })),
    ...householdQueries.flatMap((query, index) =>
      (query.data ?? []).map((recipe) => ({
        recipe,
        location: householdsQuery.data?.[index]?.name ?? "Household",
      })),
    ),
  ];
  const saveRecipe = useMutation({
    mutationFn: ({ title, householdId }: { title: string; householdId?: string }) => {
      if (!draft) throw new Error("There is no recipe draft to save.");
      return api.createRecipe(
        {
          title,
          description: draft.description,
          servings: draft.servings,
          notes: draft.notes,
          ingredients: draft.ingredients,
          steps: draft.steps,
          tags: draft.tags,
        },
        householdId,
      );
    },
    onSuccess: async (saved) => {
      setSaveOpen(false);
      await queryClient.invalidateQueries({
        queryKey: groceryQueryKeys.recipes(userId, saved.household_id),
      });
    },
  });
  const queryError =
    personalQuery.error ??
    householdsQuery.error ??
    householdQueries.find((query) => query.error)?.error;
  const loading = personalQuery.isPending || householdsQuery.isPending;

  return (
    <>
      <Screen>
        <View className="flex-row items-center justify-between gap-3 px-0.5">
          <View className="flex-1 gap-1">
            <Text className="font-extrabold tracking-normal" variant="h3">
              Saved recipes
            </Text>
            <Text variant="muted">Personal and household recipes you can reuse or edit.</Text>
          </View>
          <Badge variant="outline">{String(recipes.length)}</Badge>
        </View>

        {draft ? (
          <Card>
            <CardHeader className="flex-row items-center gap-3 pb-2">
              <View className="size-11 items-center justify-center rounded-2xl bg-muted">
                <Icon as={BookMarked} className="size-5 text-primary" />
              </View>
              <View className="flex-1 gap-0.5">
                <CardTitle>{draft.title}</CardTitle>
                <CardDescription>Current unsaved recipe from chat</CardDescription>
              </View>
            </CardHeader>
            <CardContent className="pt-2">
              <Button
                disabled={isRunning}
                icon={<Icon as={Save} className="size-4.5 text-primary-foreground" />}
                onPress={() => setSaveOpen(true)}
                size="lg"
              >
                Save this recipe
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {queryError instanceof Error ? (
          <Alert title={queryError.message} variant="destructive" />
        ) : null}
        {saveRecipe.data ? <Alert title={`${saveRecipe.data.title} saved`} /> : null}

        {loading ? (
          <View accessibilityLabel="Loading saved recipes" className="gap-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </View>
        ) : recipes.length ? (
          recipes.map(({ recipe, location }) => (
            <RecipeCard
              key={recipe.id}
              location={location}
              onPress={() =>
                router.push({ pathname: "/saved-recipe", params: { recipeId: recipe.id } })
              }
              recipe={recipe}
            />
          ))
        ) : (
          <EmptyState
            action={{ label: "Plan a recipe", onPress: () => router.replace("/chat") }}
            className="min-h-72"
            description="Recipes you save will stay here so you can quickly build the grocery list again."
            icon={<Icon as={BookMarked} className="size-8 text-primary" strokeWidth={2} />}
            title="No saved recipes yet"
          />
        )}

        <Button
          icon={<Icon as={Plus} className="size-4.5 text-secondary-foreground" />}
          onPress={() => router.push("/chat")}
          size="lg"
          variant="secondary"
        >
          Plan another recipe
        </Button>
      </Screen>
      <SaveResourceDialog
        defaultTitle={draft?.title ?? "Recipe"}
        error={saveRecipe.error instanceof Error ? saveRecipe.error.message : undefined}
        households={householdsQuery.data ?? []}
        kind="recipe"
        onConfirm={(title, householdId) => saveRecipe.mutate({ title, householdId })}
        onOpenChange={setSaveOpen}
        open={saveOpen}
        saving={saveRecipe.isPending}
      />
    </>
  );
}

function RecipeCard({
  location,
  onPress,
  recipe,
}: {
  location: string;
  onPress: () => void;
  recipe: Recipe;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card className="active:bg-muted">
        <CardHeader className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <CardTitle className="flex-1">{recipe.title}</CardTitle>
              <Badge variant="outline">{location}</Badge>
            </View>
            {recipe.description ? (
              <CardDescription numberOfLines={2}>{recipe.description}</CardDescription>
            ) : null}
            <CardDescription>
              {recipe.servings ? `${recipe.servings} servings · ` : ""}
              Open to view and edit
            </CardDescription>
          </View>
          <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
        </CardHeader>
      </Card>
    </Pressable>
  );
}
