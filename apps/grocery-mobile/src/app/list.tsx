import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { ShoppingCart, Sparkles, Tag } from "lucide-react-native";
import { KrogerProductImage } from "@/components/kroger-product-image";
import { KrogerConnectionCard } from "@/components/kroger-connection-card";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { ErrorAlert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Price } from "@/components/ui/price";
import { Text } from "@/components/ui/text";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { cartSubtotal, pantryNames } from "@/lib/grocery-state";
import { cn } from "@/lib/utils";

function GroceryListContent() {
  const router = useRouter();
  const { state, isRunning, error, send } = useGroceryAgent();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const [checked, setChecked] = useState<Set<number>>(new Set());
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
        className="flex-1 bg-background"
        description="Ask Grocery Agent for a recipe, meal plan, or budget-friendly list."
        icon={<Icon as={Sparkles} className="size-9 text-primary" />}
        title="Your first plan starts in chat."
      />
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-4 p-4.5 pb-9"
      >
        {state.meal_plan ? (
          <Card className="gap-2.5 rounded-2xl p-4">
            <View className="flex-row items-center gap-2">
              <Icon as={Sparkles} className="size-5 text-primary" />
              <Text className="text-base font-extrabold">Meal plan</Text>
            </View>
            <Text className="text-sm leading-5 text-muted-foreground" selectable>
              {state.meal_plan}
            </Text>
          </Card>
        ) : null}

        <View className="flex-row items-end justify-between px-0.5">
          <View>
            <Text className="text-2xl font-extrabold tracking-tight">
              {list.length || cart.length} grocery items
            </Text>
            <Text className="mt-1 text-xs text-muted-foreground">
              {checked.size} reviewed · {state.pantry?.length ?? 0} pantry items known
            </Text>
          </View>
          {subtotal > 0 ? (
            <Price amount={subtotal} textClassName="text-xl font-extrabold text-secondary" />
          ) : null}
        </View>

        <Card className="gap-0 overflow-hidden rounded-2xl p-0">
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
          ).map((item, index, array) => {
            const isChecked = checked.has(index);
            return (
              <View key={`${item.name}-${index}`}>
                <View className="min-h-17 flex-row items-center gap-1 px-4 py-3">
                  <Checkbox
                    accessibilityLabel={`${isChecked ? "Unmark" : "Mark"} ${item.name} reviewed`}
                    checked={isChecked}
                    onCheckedChange={() =>
                      setChecked((current) => {
                        const next = new Set(current);
                        if (next.has(index)) next.delete(index);
                        else next.add(index);
                        return next;
                      })
                    }
                  />
                  <KrogerProductImage imageUrl={item.imageUrl} name={item.name} />
                  <View className="flex-1 gap-0.5">
                    <Text
                      className={cn(
                        "text-sm font-bold",
                        isChecked && "text-muted-foreground line-through",
                      )}
                    >
                      {item.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{item.detail}</Text>
                  </View>
                </View>
                {index < array.length - 1 ? <View className="ml-25.5 h-px bg-border" /> : null}
              </View>
            );
          })}
        </Card>

        {state.weekly_deals ? (
          <Card className="gap-2.5 rounded-2xl p-4">
            <View className="flex-row items-center gap-2">
              <Icon as={Tag} className="size-5 text-primary" />
              <Text className="text-base font-extrabold">Weekly deals</Text>
            </View>
            <Text className="text-sm leading-5 text-muted-foreground" selectable>
              {state.weekly_deals}
            </Text>
          </Card>
        ) : null}

        {error ? <ErrorAlert message={error} /> : null}
        {connected ? (
          <>
            <Button
              loading={isRunning}
              disabled={!list.length}
              size="lg"
              onPress={() => setConfirmOpen(true)}
            >
              <View className="flex-row items-center gap-2">
                <Icon as={ShoppingCart} className="size-5 text-primary-foreground" />
                <Text className="text-base font-bold text-primary-foreground">
                  Add to Kroger cart
                </Text>
              </View>
            </Button>
            <Text className="px-3 text-center text-xs leading-4 text-muted-foreground" selectable>
              You are approving this cart action. Kroger prices and availability can change before
              checkout.
            </Text>
          </>
        ) : (
          <KrogerConnectionCard connection={connection} />
        )}
      </ScrollView>
      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add these items to Kroger?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends the displayed matches and quantities to your connected Kroger cart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onPress={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onPress={() => {
                setConfirmOpen(false);
                void send("Add every matched item in this grocery list to my Kroger cart now.");
              }}
            >
              Add to cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function GroceryListScreen() {
  return <GroceryListContent />;
}
