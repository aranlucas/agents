import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
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
import { Screen } from "@/components/ui/screen";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useGroceryState } from "@/hooks/use-grocery-agent";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { cartSubtotal, pantryNames } from "@/lib/grocery-state";

function GroceryListContent() {
  const router = useRouter();
  const { isRunning, error, send } = useGroceryAgent();
  const state = useGroceryState();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const list = useMemo(() => state.shopping_list ?? [], [state.shopping_list]);
  const cart = useMemo(() => state.cart ?? [], [state.cart]);
  const { matchesByName, matchesByQuery, matchesByUPC } = useMemo(() => {
    const matches = state.product_matches ?? [];
    const byName = new Map<string, (typeof matches)[number]>();
    const byQuery = new Map<string, (typeof matches)[number]>();
    const byUPC = new Map<string, (typeof matches)[number]>();
    for (const match of matches) {
      if (!byName.has(match.name)) byName.set(match.name, match);
      byQuery.set(match.query.trim().toLocaleLowerCase(), match);
      byUPC.set(match.upc, match);
    }
    return { matchesByName: byName, matchesByQuery: byQuery, matchesByUPC: byUPC };
  }, [state.product_matches]);
  const pantry = useMemo(() => pantryNames(state.pantry ?? []), [state.pantry]);
  const subtotal = useMemo(() => cartSubtotal(cart), [cart]);
  const rows = useMemo(
    () =>
      cart.length
        ? cart.map((item) => {
            const match =
              (item.upc ? matchesByUPC.get(item.upc) : undefined) ?? matchesByName.get(item.name);
            return {
              name: item.name,
              imageUrl: match?.image_url,
              detail: `${item.quantity} · ${item.price !== undefined ? `$${item.price.toFixed(2)}` : "Price at checkout"}`,
            };
          })
        : list.map((name) => {
            const normalizedName = name.trim().toLocaleLowerCase();
            const match = matchesByQuery.get(normalizedName);
            const matchDetails = [
              match?.size,
              match?.price !== undefined ? `$${match.price.toFixed(2)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return {
              name: match?.name ?? name,
              imageUrl: match?.image_url,
              detail: pantry.has(normalizedName)
                ? "Already in pantry"
                : match
                  ? matchDetails || "Kroger match"
                  : connected
                    ? "No live match selected"
                    : "Suggested item",
            };
          }),
    [cart, connected, list, matchesByName, matchesByQuery, matchesByUPC, pantry],
  );

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
      <Screen>
        {state.meal_plan ? (
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-0">
              <Icon as={Sparkles} className="size-5 text-primary" />
              <CardTitle>Meal plan</CardTitle>
            </CardHeader>
            <CardContent className="pt-2.5">
              <CardDescription selectable>{state.meal_plan}</CardDescription>
            </CardContent>
          </Card>
        ) : null}

        <View className="flex-row items-end justify-between px-0.5">
          <View>
            <Text variant="h3">{list.length || cart.length} grocery items</Text>
            <Text className="mt-1" variant="muted">
              {state.pantry?.length ?? 0} pantry items known
            </Text>
          </View>
          {subtotal > 0 ? (
            <Price amount={subtotal} textClassName="text-xl font-extrabold text-secondary" />
          ) : null}
        </View>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {rows.map((item, index) => (
              <View key={`${item.name}-${index}`}>
                <View className="min-h-17 flex-row items-center gap-3 px-4 py-3">
                  <KrogerProductImage imageUrl={item.imageUrl} name={item.name} />
                  <View className="flex-1 gap-0.5">
                    <Text variant="large">{item.name}</Text>
                    <Text variant="muted">{item.detail}</Text>
                  </View>
                </View>
                {index < rows.length - 1 ? <Separator className="ml-19" /> : null}
              </View>
            ))}
          </CardContent>
        </Card>

        {state.weekly_deals ? (
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-0">
              <Icon as={Tag} className="size-5 text-primary" />
              <CardTitle>Weekly deals</CardTitle>
            </CardHeader>
            <CardContent className="pt-2.5">
              <CardDescription selectable>{state.weekly_deals}</CardDescription>
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
      </Screen>
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
