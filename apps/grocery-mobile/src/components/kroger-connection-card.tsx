import { View } from "react-native";
import { ChevronRight, ShoppingCart } from "lucide-react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
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
      <Card className="min-h-20 rounded-2xl p-0 shadow-none">
        <CardHeader className="flex-row items-center gap-3 p-3">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            {isLoading ? (
              <Spinner size="sm" />
            ) : (
              <Icon as={ShoppingCart} className="size-6 text-primary" />
            )}
          </View>
          <View className="flex-1 gap-0.5">
            <CardTitle className="text-lg font-extrabold tracking-normal">
              Connect Kroger when you’re ready
            </CardTitle>
            <CardDescription className="leading-5" selectable>
              Optional for live products, prices, and cart actions.
            </CardDescription>
          </View>
          <Button
            accessibilityLabel="Connect Kroger"
            className="min-h-10 px-2"
            disabled={isLoading}
            iconAfter={<Icon as={ChevronRight} className="size-5 text-primary" />}
            loading={connecting}
            onPress={() => {
              clearError();
              void connect();
            }}
            size="sm"
            variant="ghost"
          >
            Connect
          </Button>
        </CardHeader>
      </Card>
      {error ? <Alert title={error} variant="destructive" /> : null}
    </View>
  );
}
