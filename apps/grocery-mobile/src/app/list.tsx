import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, Circle, ShoppingCart, Sparkles, Tag } from "lucide-react-native";
import { KrogerProductImage } from "@/components/kroger-product-image";
import { KrogerConnectionCard } from "@/components/kroger-connection-card";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { Card, InlineError, PrimaryButton, SecondaryButton } from "@/components/ui";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { cartSubtotal, pantryNames } from "@/lib/grocery-state";
import { colors } from "@/lib/theme";

function GroceryListContent() {
  const router = useRouter();
  const { state, isRunning, error, send } = useGroceryAgent();
  const connection = useKrogerConnection();
  const { connected } = connection;
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const list = state.shopping_list ?? [];
  const cart = state.cart ?? [];
  const matches = state.product_matches ?? [];
  const matchesByQuery = new Map(
    matches.map((match) => [match.query.trim().toLocaleLowerCase(), match]),
  );
  const matchesByUPC = new Map(matches.map((match) => [match.upc, match]));
  const pantry = pantryNames(state.pantry ?? []);
  const subtotal = cartSubtotal(cart);

  const confirmAdd = () => {
    Alert.alert(
      "Add these items to Kroger?",
      "This sends the displayed matches and quantities to your connected Kroger cart.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add to cart",
          onPress: () =>
            void send("Add every matched item in this grocery list to my Kroger cart now."),
        },
      ],
    );
  };

  if (!list.length && !cart.length && !state.meal_plan) {
    return (
      <View style={styles.empty}>
        <Sparkles color={colors.green} size={34} />
        <Text style={styles.emptyTitle}>Your first plan starts in chat.</Text>
        <Text style={styles.emptyText}>
          Ask Grocery Agent for a recipe, meal plan, or budget-friendly list.
        </Text>
        <SecondaryButton onPress={() => router.back()}>Start planning</SecondaryButton>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {state.meal_plan ? (
        <Card style={styles.planCard}>
          <View style={styles.sectionHeading}>
            <Sparkles color={colors.green} size={19} />
            <Text style={styles.sectionTitle}>Meal plan</Text>
          </View>
          <Text selectable style={styles.body}>
            {state.meal_plan}
          </Text>
        </Card>
      ) : null}

      <View style={styles.headingRow}>
        <View>
          <Text style={styles.title}>{list.length || cart.length} grocery items</Text>
          <Text style={styles.meta}>
            {checked.size} reviewed · {state.pantry?.length ?? 0} pantry items known
          </Text>
        </View>
        {subtotal > 0 ? <Text style={styles.subtotal}>${subtotal.toFixed(2)}</Text> : null}
      </View>

      <Card style={styles.listCard}>
        {(cart.length
          ? cart.map((item) => {
              const match =
                (item.upc ? matchesByUPC.get(item.upc) : undefined) ??
                matches.find((candidate) => candidate.name === item.name);
              return {
                name: item.name,
                imageUrl: match?.image_url,
                detail: `${item.quantity} · ${item.price ? `$${item.price.toFixed(2)}` : "Price at checkout"}`,
              };
            })
          : list.map((name) => {
              const match = matchesByQuery.get(name.trim().toLocaleLowerCase());
              const matchDetails = [match?.size, match?.price ? `$${match.price.toFixed(2)}` : null]
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
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
                onPress={() =>
                  setChecked((current) => {
                    const next = new Set(current);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })
                }
                style={styles.item}
              >
                {isChecked ? (
                  <View style={styles.checked}>
                    <Check color={colors.white} size={15} />
                  </View>
                ) : (
                  <Circle color={colors.line} size={24} />
                )}
                <KrogerProductImage imageUrl={item.imageUrl} name={item.name} />
                <View style={styles.itemCopy}>
                  <Text style={[styles.itemName, isChecked && styles.itemNameChecked]}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemDetail}>{item.detail}</Text>
                </View>
              </Pressable>
              {index < array.length - 1 ? <View style={styles.rule} /> : null}
            </View>
          );
        })}
      </Card>

      {state.weekly_deals ? (
        <Card style={styles.dealCard}>
          <View style={styles.sectionHeading}>
            <Tag color={colors.green} size={19} />
            <Text style={styles.sectionTitle}>Weekly deals</Text>
          </View>
          <Text selectable style={styles.body}>
            {state.weekly_deals}
          </Text>
        </Card>
      ) : null}

      {error ? <InlineError message={error} /> : null}
      {connected ? (
        <>
          <PrimaryButton loading={isRunning} disabled={!list.length} onPress={confirmAdd}>
            <View style={styles.buttonContent}>
              <ShoppingCart color={colors.white} size={19} />
              <Text style={styles.buttonText}>Add to Kroger cart</Text>
            </View>
          </PrimaryButton>
          <Text selectable style={styles.disclaimer}>
            You are approving this cart action. Kroger prices and availability can change before
            checkout.
          </Text>
        </>
      ) : (
        <KrogerConnectionCard connection={connection} />
      )}
    </ScrollView>
  );
}

export default function GroceryListScreen() {
  return <GroceryListContent />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, gap: 16, paddingBottom: 36 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 13,
    backgroundColor: colors.background,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 8,
  },
  planCard: { padding: 17, gap: 10 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 2,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  subtotal: { color: colors.forest, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  listCard: { overflow: "hidden" },
  item: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  checked: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCopy: { flex: 1, gap: 2 },
  itemName: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  itemNameChecked: { color: colors.muted, textDecorationLine: "line-through" },
  itemDetail: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  rule: { height: 1, backgroundColor: colors.line, marginLeft: 102 },
  dealCard: { padding: 17, gap: 9 },
  buttonContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonText: { color: colors.white, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  disclaimer: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
