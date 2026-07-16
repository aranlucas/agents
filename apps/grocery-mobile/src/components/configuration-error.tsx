import { View } from "react-native";
import { BrandMark } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { SafeArea } from "@/components/ui/safe-area";
import { Text } from "@/components/ui/text";

export function ConfigurationError({ message }: { message: string }) {
  return (
    <SafeArea>
      <View className="flex-1 justify-center gap-6 p-6">
        <BrandMark size="lg" />
        <Card className="gap-2.5 rounded-2xl p-6">
          <Text className="tracking-wider text-primary" variant="small">
            SETUP NEEDED
          </Text>
          <Text className="text-left font-extrabold" selectable variant="h3">
            This build is not configured yet.
          </Text>
          <Text className="leading-6 text-muted-foreground" selectable>
            {message}
          </Text>
        </Card>
      </View>
    </SafeArea>
  );
}
