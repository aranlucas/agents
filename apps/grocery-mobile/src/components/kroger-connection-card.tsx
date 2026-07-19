import { View } from "react-native";
import { ChevronRight, ShoppingCart } from "lucide-react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";

export function KrogerConnectionCard({
  connection,
}: {
  connection: ReturnType<typeof useKrogerConnection>;
}) {
  const { connected, isLoading, error, clearError, connect } = connection;

  if (connected) return null;

  return (
    <View className="gap-2">
      <Card>
        <CardHeader className="flex-row items-center gap-3 pb-0">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            <Icon as={ShoppingCart} className="size-6 text-primary" />
          </View>
          <View className="flex-1 gap-0.5">
            <CardTitle>Connect Kroger when you’re ready</CardTitle>
            <CardDescription selectable>
              Optional for live products, prices, and cart actions.
            </CardDescription>
          </View>
        </CardHeader>
        <CardFooter>
          <Button
            accessibilityLabel="Connect Kroger"
            className="flex-1"
            iconAfter={<Icon as={ChevronRight} className="size-5 text-secondary-foreground" />}
            loading={isLoading}
            onPress={() => {
              clearError();
              void connect();
            }}
            size="lg"
            variant="secondary"
          >
            Connect
          </Button>
        </CardFooter>
      </Card>
      {error ? <Alert title={error} variant="destructive" /> : null}
    </View>
  );
}
