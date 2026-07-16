import { View } from "react-native";
import { ChevronRight, ShoppingCart } from "lucide-react-native";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";

export function KrogerConnectionCard({
  connection,
}: {
  connection: ReturnType<typeof useKrogerConnection>;
}) {
  const { connected, isLoading, connecting, error, clearError, connect } = connection;

  if (connected) return null;

  return (
    <View className="gap-2">
      <Card className="min-h-20 flex-row items-center gap-3 rounded-2xl p-3 shadow-none">
        <View className="size-11 items-center justify-center rounded-2xl bg-muted">
          {isLoading ? (
            <Spinner size="sm" />
          ) : (
            <Icon as={ShoppingCart} className="size-6 text-primary" />
          )}
        </View>
        <View className="flex-1 gap-0.5">
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
          <Icon as={ChevronRight} className="size-5 text-primary" />
        </Button>
      </Card>
      {error ? <ErrorAlert message={error} /> : null}
    </View>
  );
}
