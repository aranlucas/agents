import type { GroceryState } from "@agents/types";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, Check, ShoppingBasket, ShoppingCart, Sparkles } from "lucide-react-native";
import { NativeMarkdown, type NativeMarkdownStyle } from "@agents/native-markdown";
import { KrogerProductImage } from "@/components/kroger-product-image";
import { Card, PrimaryButton } from "@/components/ui";
import { cartSubtotal, pantryNames } from "@/lib/grocery-state";
import { colors } from "@/lib/theme";

export function GroceryStateCard({
  state,
  onOpenList,
  onAddToCart,
  adding,
  connected,
}: {
  state: GroceryState;
  onOpenList: () => void;
  onAddToCart: () => void;
  adding: boolean;
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
  if (!list.length && !state.meal_plan && !cart.length) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.storeRow}>
        <View style={styles.storeMark}>
          <ShoppingBasket color={colors.green} size={22} />
        </View>
        <View style={styles.storeCopy}>
          <Text style={styles.storeName}>
            {connected ? "Kroger grocery plan" : "Your grocery plan"}
          </Text>
          <Text style={styles.storeMeta}>
            {state.status === "ready" ? "Ready to review" : "Building your matches"}
          </Text>
        </View>
        {connected ? (
          <View style={styles.connected}>
            <Check size={13} color={colors.green} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        ) : null}
      </View>

      {state.meal_plan ? (
        <View style={styles.plan}>
          <Sparkles size={17} color={colors.green} />
          <View style={styles.planCopy}>
            <NativeMarkdown maxBlocks={2} style={planMarkdownStyle}>
              {state.meal_plan}
            </NativeMarkdown>
          </View>
        </View>
      ) : null}

      <View style={styles.previewRow}>
        {preview.map((item, index) => (
          <View key={`${item.name}-${index}`} style={[styles.product, previewTone(index)]}>
            <KrogerProductImage imageUrl={item.imageUrl} name={item.name} size={38} />
            <Text numberOfLines={2} style={styles.productName}>
              {item.name}
            </Text>
          </View>
        ))}
        {list.length > preview.length ? (
          <View style={[styles.product, styles.more]}>
            <Text style={styles.moreCount}>+{list.length - preview.length}</Text>
            <Text style={styles.moreLabel}>more</Text>
          </View>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenList} style={styles.reviewRow}>
        <View>
          <Text style={styles.reviewTitle}>Review {Math.max(list.length, cart.length)} items</Text>
          <Text style={styles.reviewMeta}>
            {subtotal > 0
              ? `$${subtotal.toFixed(2)} estimated subtotal`
              : "Check quantities and matches"}
            {skipped.length ? ` · ${skipped.length} in pantry` : ""}
          </Text>
        </View>
        <ArrowRight size={20} color={colors.forest} />
      </Pressable>

      {connected && list.length > 0 ? (
        <PrimaryButton loading={adding} onPress={onAddToCart}>
          <View style={styles.buttonContent}>
            <ShoppingCart size={18} color={colors.white} />
            <Text style={styles.buttonText}>Add to Kroger cart</Text>
          </View>
        </PrimaryButton>
      ) : null}
      {connected ? (
        <Text selectable style={styles.disclaimer}>
          Nothing changes in your Kroger cart until you approve this action.
        </Text>
      ) : null}
    </Card>
  );
}

function previewTone(index: number) {
  return [styles.productAmber, styles.productViolet, styles.productRose, styles.productLime][
    index % 4
  ];
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 14 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  storeMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  storeCopy: { flex: 1, gap: 2 },
  storeName: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  storeMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  connected: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  connectedText: { color: colors.green, fontSize: 11, fontWeight: "700" },
  plan: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 12,
  },
  planCopy: { flex: 1, minWidth: 0 },
  previewRow: { flexDirection: "row", gap: 8 },
  product: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    backgroundColor: "#f4f5f1",
    borderRadius: 14,
    padding: 8,
    justifyContent: "space-between",
  },
  productAmber: { backgroundColor: "#fff6e8" },
  productViolet: { backgroundColor: "#f5f0ff" },
  productRose: { backgroundColor: "#fff0f1" },
  productLime: { backgroundColor: "#f3f7e6" },
  productName: { color: colors.ink, fontSize: 10, lineHeight: 13, fontWeight: "600" },
  more: { alignItems: "center", justifyContent: "center" },
  moreCount: { color: colors.forest, fontSize: 19, fontWeight: "800" },
  moreLabel: { color: colors.muted, fontSize: 11 },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reviewTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  reviewMeta: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  buttonContent: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonText: { color: colors.white, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center" },
});

const planMarkdownStyle: NativeMarkdownStyle = {
  body: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  link: { color: colors.green },
};
