import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, ShoppingCart } from "lucide-react-native";
import { Card, InlineError } from "@/components/ui";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { colors } from "@/lib/theme";

export function KrogerConnectionCard({
  connection,
}: {
  connection: ReturnType<typeof useKrogerConnection>;
}) {
  const { connected, isLoading, connecting, error, clearError, connect } = connection;

  if (connected) return null;

  return (
    <View style={styles.wrap}>
      <Card style={styles.card}>
        <View style={styles.icon}>
          {isLoading ? (
            <ActivityIndicator color={colors.green} />
          ) : (
            <ShoppingCart color={colors.green} size={24} />
          )}
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Connect Kroger when you’re ready</Text>
          <Text selectable style={styles.body}>
            Optional for live products, prices, and cart actions.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Connect Kroger"
          accessibilityRole="button"
          disabled={isLoading || connecting}
          onPress={() => {
            clearError();
            void connect();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          {connecting ? (
            <ActivityIndicator color={colors.green} size="small" />
          ) : (
            <>
              <Text style={styles.actionText}>Connect</Text>
              <ChevronRight color={colors.green} size={19} />
            </>
          )}
        </Pressable>
      </Card>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  card: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    boxShadow: "none",
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  action: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: 8,
  },
  actionPressed: { opacity: 0.65 },
  actionText: { color: colors.green, fontSize: 13, fontWeight: "800" },
});
