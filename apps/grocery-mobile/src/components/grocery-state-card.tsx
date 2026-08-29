import type { GroceryState } from "@agents/types";
import { Pressable, View } from "react-native";
import {
  ArrowRight,
  BookMarked,
  Save,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
} from "lucide-react-native";
import { KrogerProductImage } from "@/components/kroger-product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MarkdownText } from "@/components/ui/markdown-text";
import { Price } from "@/components/ui/price";
import { Text } from "@/components/ui/text";
import { cartSubtotal, pantryNames } from "@/lib/grocery-state";
import { cn } from "@/lib/utils";

export function GroceryStateCard({
  state,
  onOpenList,
  onAddToCart,
  onSaveList,
  onSaveRecipe,
  adding = false,
  connected,
}: {
  state: GroceryState;
  onOpenList?: () => void;
  onAddToCart?: () => void;
  onSaveList?: () => void;
  onSaveRecipe?: () => void;
  adding?: boolean;
  connected: boolean;
}) {
  const list = state.shopping_list ?? [];
  const cart = state.cart ?? [];
  const matches = state.product_matches ?? [];
  const pantry = pantryNames(state.shopping_profile?.pantry ?? []);
  const skipped = list.filter((item) => pantry.has(item.trim().toLocaleLowerCase()));
  const preview: Array<{ name: string; imageUrl?: string }> = matches.length
    ? matches.slice(0, 4).map((item) => ({ name: item.name, imageUrl: item.image_url }))
    : cart.length > 0
      ? cart.slice(0, 4).map((item) => ({ name: item.name }))
      : list.slice(0, 4).map((name) => ({ name }));
  const subtotal = cartSubtotal(cart);
  if (!list.length && !state.meal_plan && !state.recipe && !cart.length) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 pb-0">
        <View className="size-11 items-center justify-center rounded-full bg-muted">
          <Icon as={ShoppingBasket} className="size-5.5 text-primary" />
        </View>
        <View className="flex-1 gap-0.5">
          <CardTitle>{connected ? "Kroger grocery plan" : "Your grocery plan"}</CardTitle>
          <CardDescription>
            {state.status === "ready" ? "Ready to review" : "Building your matches"}
          </CardDescription>
        </View>
        {connected ? <Badge variant="secondary">Connected</Badge> : null}
      </CardHeader>

      <CardContent className="gap-3.5">
        {state.meal_plan ? (
          <View className="flex-row gap-2 rounded-2xl bg-muted p-3">
            <Icon as={Sparkles} className="size-4 text-primary" />
            <View className="min-w-0 flex-1">
              <MarkdownText content={state.meal_plan} />
            </View>
          </View>
        ) : null}

        {state.recipe ? (
          <View className="gap-2 rounded-2xl bg-muted p-3">
            <View className="flex-row items-center gap-2">
              <Icon as={BookMarked} className="size-4.5 text-primary" />
              <Text className="flex-1" variant="large">
                {state.recipe.title}
              </Text>
            </View>
            {state.recipe.description ? (
              <Text numberOfLines={3} variant="muted">
                {state.recipe.description}
              </Text>
            ) : null}
            <Text variant="muted">
              {state.recipe.ingredients.length} ingredients · {state.recipe.steps.length} steps
            </Text>
            {onSaveRecipe ? (
              <Button
                disabled={adding}
                icon={<Icon as={Save} className="size-4.5 text-secondary-foreground" />}
                onPress={onSaveRecipe}
                size="sm"
                variant="secondary"
              >
                Save recipe
              </Button>
            ) : null}
          </View>
        ) : null}

        {preview.length ? (
          <View className="flex-row gap-2">
            {preview.map((item, index) => (
              <View
                className={cn(
                  "min-h-24 min-w-0 flex-1 justify-between rounded-2xl p-2",
                  previewTone(index),
                )}
                key={`${item.name}-${index}`}
              >
                <KrogerProductImage imageUrl={item.imageUrl} name={item.name} size="compact" />
                <Text className="leading-4 font-semibold" numberOfLines={2}>
                  {item.name}
                </Text>
              </View>
            ))}
            {list.length > preview.length ? (
              <View className="min-h-24 min-w-0 flex-1 items-center justify-center rounded-2xl bg-muted p-2">
                <Text className="text-secondary" variant="h4">
                  +{list.length - preview.length}
                </Text>
                <Text variant="muted">more</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {list.length || cart.length ? (
          <Pressable
            accessibilityRole={onOpenList ? "button" : undefined}
            className="flex-row items-center justify-between rounded-2xl bg-muted px-3.5 py-3 active:opacity-70"
            disabled={!onOpenList}
            onPress={onOpenList}
          >
            <View>
              <Text variant="large">Review {Math.max(list.length, cart.length)} items</Text>
              {subtotal > 0 ? (
                <Price
                  amount={subtotal}
                  prefix="Estimated subtotal"
                  textClassName="text-xs text-muted-foreground"
                />
              ) : (
                <Text className="mt-0.5" variant="muted">
                  Check quantities and matches
                </Text>
              )}
              {skipped.length ? <Text variant="muted">{skipped.length} in pantry</Text> : null}
            </View>
            <Icon as={ArrowRight} className="size-5 text-secondary" />
          </Pressable>
        ) : null}
      </CardContent>

      {list.length > 0 && (onSaveList || (connected && onAddToCart)) ? (
        <CardFooter className="items-stretch gap-2 pt-0">
          {onSaveList ? (
            <Button
              className="flex-1"
              disabled={adding || state.status !== "ready"}
              icon={<Icon as={Save} className="size-4.5 text-secondary-foreground" />}
              onPress={onSaveList}
              size="lg"
              variant="secondary"
            >
              Save list
            </Button>
          ) : null}
          {connected && onAddToCart ? (
            <Button
              className="flex-1"
              icon={<Icon as={ShoppingCart} className="size-4.5 text-primary-foreground" />}
              loading={adding}
              onPress={onAddToCart}
              size="lg"
            >
              Add to Kroger cart
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function previewTone(index: number) {
  return ["bg-muted", "bg-accent/40", "bg-primary/5", "bg-secondary/10"][index % 4];
}
