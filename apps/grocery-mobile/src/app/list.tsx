import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ShoppingCart, Sparkles, Tag } from "lucide-react-native";
import { ADD_TO_CART_MESSAGE, AddToCartDialog } from "@/components/add-to-cart-dialog";
import { KrogerProductImage } from "@/components/kroger-product-image";
import { KrogerConnectionCard } from "@/components/kroger-connection-card";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Price } from "@/components/ui/price";
import { Text } from "@/components/ui/text";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { cartSubtotal, pantryNames } from "@/lib/grocery-state";

function GroceryListContent() {
  const router = useRouter();
  const { state, isRunning, error, send } = useGroceryAgent();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const list = state.shopping_list ?? [];
  const cart = state.cart ?? [];
  const matches = state.product_matches ?? [];
  const matchesByQuery = new Map(
    matches.map((match) => [match.query.trim().toLocaleLowerCase(), match]),
  );
  const matchesByUPC = new Map(matches.map((match) => [match.upc, match]));
  const pantry = pantryNames(state.pantry ?? []);
  const subtotal = cartSubtotal(cart);

  if (!list.length && !cart.length && !state.meal_plan) {
    return (
      <EmptyState
        action={{ label: "Start planning", onPress: () => router.replace("/chat") }}
        className="w-full max-w-3xl flex-1 self-center bg-background"
        description="Ask Grocery Agent for a recipe, meal plan, or budget-friendly list."
        icon={<Icon as={Sparkles} className="size-9 text-primary" />}
        title="Your first plan starts in chat"
      />
    );
  }

  return (
    <>
      <ScrollView
        className="w-full max-w-3xl flex-1 self-center bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-4 p-4.5 pb-9"
      >
        {state.meal_plan ? (
          <Card className="rounded-2xl p-0">
            <CardHeader className="flex-row items-center gap-2 p-4 pb-0">
              <Icon as={Sparkles} className="size-5 text-primary" />
              <CardTitle className="text-lg font-extrabold tracking-normal">Meal plan</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2.5">
              <CardDescription className="leading-5" selectable>
                {state.meal_plan}
              </CardDescription>
            </CardContent>
          </Card>
        ) : null}

        <View className="flex-row items-end justify-between px-0.5">
          <View>
            <Text className="font-extrabold" variant="h3">
              {list.length || cart.length} grocery items
            </Text>
            <Text className="mt-1" variant="muted">
              {state.pantry?.length ?? 0} pantry items known
            </Text>
          </View>
          {subtotal > 0 ? (
            <Price amount={subtotal} textClassName="text-xl font-extrabold text-secondary" />
          ) : null}
        </View>

        <Card className="overflow-hidden rounded-2xl p-0">
          <CardContent className="p-0">
            {(cart.length
              ? cart.map((item) => {
                  const match =
                    (item.upc ? matchesByUPC.get(item.upc) : undefined) ??
                    matches.find((candidate) => candidate.name === item.name);
                  return {
                    name: item.name,
                    imageUrl: match?.image_url,
                    detail: `${item.quantity} · ${item.price !== undefined ? `$${item.price.toFixed(2)}` : "Price at checkout"}`,
                  };
                })
              : list.map((name) => {
                  const match = matchesByQuery.get(name.trim().toLocaleLowerCase());
                  const matchDetails = [
                    match?.size,
                    match?.price !== undefined ? `$${match.price.toFixed(2)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return {
                    name: match?.name ?? name,
                    imageUrl: match?.image_url,
                    detail: pantry.has(name.trim().toLocaleLowerCase())
                      ? "Already in pantry"
                      : match
                        ? matchDetails || "Kroger match"
                        : connected
                          ? "No live match selected"
                          : "Suggested item",
                  };
                })
            ).map((item, index, array) => (
              <View key={`${item.name}-${index}`}>
                <View className="min-h-17 flex-row items-center gap-3 px-4 py-3">
                  <KrogerProductImage imageUrl={item.imageUrl} name={item.name} />
                  <View className="flex-1 gap-0.5">
                    <Text className="font-bold" variant="large">
                      {item.name}
                    </Text>
                    <Text variant="muted">{item.detail}</Text>
                  </View>
                </View>
                {index < array.length - 1 ? <View className="ml-19 h-px bg-border" /> : null}
              </View>
            ))}
          </CardContent>
        </Card>

        {state.weekly_deals ? (
          <Card className="rounded-2xl p-0">
            <CardHeader className="flex-row items-center gap-2 p-4 pb-0">
              <Icon as={Tag} className="size-5 text-primary" />
              <CardTitle className="text-lg font-extrabold tracking-normal">Weekly deals</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2.5">
              <CardDescription className="leading-5" selectable>
                {state.weekly_deals}
              </CardDescription>
            </CardContent>
          </Card>
        ) : null}

        {error ? <Alert title={error} variant="destructive" /> : null}
        {connected ? (
          <Button
            icon={<Icon as={ShoppingCart} className="size-5 text-primary-foreground" />}
            loading={isRunning}
            disabled={!list.length}
            size="lg"
            onPress={() => setConfirmOpen(true)}
          >
            Add to Kroger cart
          </Button>
        ) : (
          <KrogerConnectionCard connection={connection} />
        )}
      </ScrollView>
      <AddToCartDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void send(ADD_TO_CART_MESSAGE)}
      />
    </>
  );
}

export default function GroceryListScreen() {
  return <GroceryListContent />;
}
