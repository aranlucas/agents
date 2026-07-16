import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ChevronRight, ShoppingCart } from "lucide-react-native";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
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
      <Card className="min-h-20 flex-row items-center gap-3 rounded-2xl p-3 shadow-none">
        <View style={styles.icon}>
          {isLoading ? (
            <ActivityIndicator color={colors.green} />
          ) : (
            <ShoppingCart color={colors.green} size={24} />
          )}
        </View>
        <View style={styles.copy}>
          <Text className="text-sm font-extrabold">Connect Kroger when you’re ready</Text>
          <Text className="text-xs text-muted-foreground" selectable>
            Optional for live products, prices, and cart actions.
          </Text>
        </View>
        <Button
          accessibilityLabel="Connect Kroger"
          className="min-h-10 px-2"
          disabled={isLoading}
          loading={connecting}
          onPress={() => {
            clearError();
            void connect();
          }}
          size="sm"
          variant="ghost"
        >
          <Text className="text-sm font-extrabold text-primary">Connect</Text>
          <ChevronRight color={colors.green} size={19} />
        </Button>
      </Card>
      {error ? <ErrorAlert message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 2 },
});
