import type { GroceryState } from "@agents/types";
import { Pressable, View } from "react-native";
import { ArrowRight, Check, ShoppingBasket, ShoppingCart, Sparkles } from "lucide-react-native";
import { NativeMarkdown, type NativeMarkdownStyle } from "@agents/native-markdown";
import { useMemo } from "react";
import { useResolveClassNames } from "uniwind";
import { KrogerProductImage } from "@/components/kroger-product-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cartSubtotal, pantryNames } from "@/lib/grocery-state";
import { cn } from "@/lib/utils";

export function GroceryStateCard({
  state,
  onOpenList,
  onAddToCart,
  adding = false,
  connected,
}: {
  state: GroceryState;
  onOpenList?: () => void;
  onAddToCart?: () => void;
  adding?: boolean;
  connected: boolean;
}) {
  const list = state.shopping_list ?? [];
  const cart = state.cart ?? [];
  const matches = state.product_matches ?? [];
  const pantry = pantryNames(state.pantry ?? []);
  const skipped = list.filter((item) => pantry.has(item.trim().toLocaleLowerCase()));
  const preview: Array<{ name: string; imageUrl?: string }> = matches.length
    ? matches.slice(0, 4).map((item) => ({ name: item.name, imageUrl: item.image_url }))
    : cart.length > 0
      ? cart.slice(0, 4).map((item) => ({ name: item.name }))
      : list.slice(0, 4).map((name) => ({ name }));
  const subtotal = cartSubtotal(cart);
  const foreground = useResolveClassNames("text-foreground").color;
  const primary = useResolveClassNames("text-primary").color;
  const planMarkdownStyle = useMemo<NativeMarkdownStyle>(
    () => ({
      body: { color: foreground, fontSize: 13, lineHeight: 19 },
      paragraph: { marginTop: 0, marginBottom: 6 },
      link: { color: primary },
    }),
    [foreground, primary],
  );
  if (!list.length && !state.meal_plan && !cart.length) return null;

  return (
    <Card className="gap-3.5 rounded-2xl p-4">
      <View className="flex-row items-center gap-2.5">
        <View className="size-11 items-center justify-center rounded-full bg-muted">
          <Icon as={ShoppingBasket} className="size-5.5 text-primary" />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-extrabold">
            {connected ? "Kroger grocery plan" : "Your grocery plan"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {state.status === "ready" ? "Ready to review" : "Building your matches"}
          </Text>
        </View>
        {connected ? (
          <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-1">
            <Icon as={Check} className="size-3.5 text-primary" />
            <Text className="text-xs font-bold text-primary">Connected</Text>
          </View>
        ) : null}
      </View>

      {state.meal_plan ? (
        <View className="flex-row gap-2 rounded-2xl bg-muted p-3">
          <Icon as={Sparkles} className="size-4 text-primary" />
          <View className="min-w-0 flex-1">
            <NativeMarkdown maxBlocks={2} style={planMarkdownStyle}>
              {state.meal_plan}
            </NativeMarkdown>
          </View>
        </View>
      ) : null}

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
            <Text className="text-xs leading-4 font-semibold" numberOfLines={2}>
              {item.name}
            </Text>
          </View>
        ))}
        {list.length > preview.length ? (
          <View className="min-h-24 min-w-0 flex-1 items-center justify-center rounded-2xl bg-muted p-2">
            <Text className="text-xl font-extrabold text-secondary">
              +{list.length - preview.length}
            </Text>
            <Text variant="muted">more</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole={onOpenList ? "button" : undefined}
        className="flex-row items-center justify-between rounded-2xl bg-muted px-3.5 py-3 active:opacity-70"
        disabled={!onOpenList}
        onPress={onOpenList}
      >
        <View>
          <Text className="text-sm font-extrabold">
            Review {Math.max(list.length, cart.length)} items
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {subtotal > 0
              ? `$${subtotal.toFixed(2)} estimated subtotal`
              : "Check quantities and matches"}
            {skipped.length ? ` · ${skipped.length} in pantry` : ""}
          </Text>
        </View>
        <Icon as={ArrowRight} className="size-5 text-secondary" />
      </Pressable>

      {connected && list.length > 0 && onAddToCart ? (
        <Button loading={adding} size="lg" onPress={onAddToCart}>
          <View className="flex-row items-center gap-2">
            <Icon as={ShoppingCart} className="size-4.5 text-primary-foreground" />
            <Text className="text-base font-bold text-primary-foreground">Add to Kroger cart</Text>
          </View>
        </Button>
      ) : null}
      {connected && onAddToCart ? (
        <Text className="text-center text-xs leading-4 text-muted-foreground" selectable>
          Nothing changes in your Kroger cart until you approve this action.
        </Text>
      ) : null}
    </Card>
  );
}

function previewTone(index: number) {
  return ["bg-muted", "bg-accent/40", "bg-primary/5", "bg-secondary/10"][index % 4];
}
