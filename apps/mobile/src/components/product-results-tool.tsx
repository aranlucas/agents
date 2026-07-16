import { useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRenderTool } from "@copilotkit/react-native";
import { z } from "zod";

export const PRODUCT_RESULTS_TOOL_NAME = "show_product_results";

const productSchema = z.object({
  upc: z.string().regex(/^\d{1,13}$/),
  name: z.string().min(1).max(160),
  brand: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  price: z.number().nonnegative().optional(),
  regularPrice: z.number().nonnegative().optional(),
  pickup: z.boolean().optional(),
});

export const productResultsSchema = z.object({
  title: z.string().max(80).optional(),
  products: z.array(productSchema).min(1).max(10),
});

export type ProductResults = z.infer<typeof productResultsSchema>;
type Product = z.infer<typeof productSchema>;

export function krogerProductImageUrl(upc: string): string {
  return `https://www.kroger.com/product/images/small/front/${encodeURIComponent(upc)}`;
}

function ProductCard({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasSale =
    product.price !== undefined &&
    product.regularPrice !== undefined &&
    product.price < product.regularPrice;

  return (
    <View style={styles.card} accessibilityLabel={`${product.name} product result`}>
      <View style={styles.imageFrame}>
        {imageFailed ? (
          <Text style={styles.imageFallback}>No image</Text>
        ) : (
          <Image
            source={{ uri: krogerProductImageUrl(product.upc) }}
            style={styles.image}
            resizeMode="contain"
            onError={() => setImageFailed(true)}
            accessibilityLabel={`${product.name} image`}
          />
        )}
      </View>
      <View style={styles.details}>
        {product.brand ? <Text style={styles.brand}>{product.brand}</Text> : null}
        <Text style={styles.name} numberOfLines={3}>
          {product.name}
        </Text>
        {product.size ? <Text style={styles.size}>{product.size}</Text> : null}
        <View style={styles.priceRow}>
          {product.price !== undefined ? (
            <Text style={styles.price}>${product.price.toFixed(2)}</Text>
          ) : (
            <Text style={styles.unavailable}>Price unavailable</Text>
          )}
          {hasSale ? (
            <Text style={styles.regularPrice}>${product.regularPrice?.toFixed(2)}</Text>
          ) : null}
        </View>
        <View style={[styles.badge, product.pickup === false && styles.badgeMuted]}>
          <Text style={[styles.badgeText, product.pickup === false && styles.badgeTextMuted]}>
            {product.pickup === false ? "Pickup unavailable" : "Pickup available"}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ProductResultsCard({
  args,
  loading = false,
}: {
  args: unknown;
  loading?: boolean;
}) {
  const parsed = productResultsSchema.safeParse(args);
  if (!parsed.success) {
    return (
      <View style={styles.fallback} accessibilityRole="alert">
        <Text style={styles.fallbackTitle}>Product results unavailable</Text>
        <Text style={styles.fallbackText}>The shopping results were incomplete.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>KROGER PRODUCTS</Text>
          <Text style={styles.title}>{parsed.data.title ?? "Product matches"}</Text>
        </View>
        {loading ? <ActivityIndicator color="#15803d" /> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.productList}
      >
        {parsed.data.products.map((product) => (
          <ProductCard key={product.upc} product={product} />
        ))}
      </ScrollView>
    </View>
  );
}

export function GroceryProductResultsTool() {
  useRenderTool(
    {
      name: PRODUCT_RESULTS_TOOL_NAME,
      agentId: "grocery",
      description:
        "Display Kroger product matches in native product cards after search_products succeeds. Copy exact product facts from the search result; never invent products or prices.",
      parameters: productResultsSchema,
      handler: async ({ products }) => ({ displayed: products.length }),
      render: ({ args, status }) => (
        <ProductResultsCard args={args} loading={status === "executing"} />
      ),
    },
    [],
  );

  return null;
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d1fae5",
    borderRadius: 18,
    backgroundColor: "#f0fdf4",
    paddingVertical: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  eyebrow: { color: "#15803d", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: "#14532d", fontSize: 20, lineHeight: 25, fontWeight: "800" },
  productList: { paddingHorizontal: 14, gap: 10 },
  card: {
    width: 188,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dcfce7",
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  imageFrame: {
    height: 138,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  image: { width: 126, height: 126 },
  imageFallback: { color: "#9ca3af", fontSize: 12 },
  details: { minHeight: 178, padding: 12, gap: 5 },
  brand: { color: "#15803d", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  name: { color: "#111827", fontSize: 15, lineHeight: 19, fontWeight: "700" },
  size: { color: "#6b7280", fontSize: 12 },
  priceRow: { minHeight: 25, flexDirection: "row", alignItems: "baseline", gap: 7 },
  price: { color: "#111827", fontSize: 20, fontWeight: "800" },
  regularPrice: { color: "#9ca3af", fontSize: 12, textDecorationLine: "line-through" },
  unavailable: { color: "#6b7280", fontSize: 12 },
  badge: {
    alignSelf: "flex-start",
    marginTop: "auto",
    borderRadius: 999,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeMuted: { backgroundColor: "#f3f4f6" },
  badgeText: { color: "#166534", fontSize: 11, fontWeight: "700" },
  badgeTextMuted: { color: "#6b7280" },
  fallback: {
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    padding: 14,
    gap: 4,
  },
  fallbackTitle: { color: "#111827", fontSize: 15, fontWeight: "700" },
  fallbackText: { color: "#6b7280", fontSize: 14 },
});
