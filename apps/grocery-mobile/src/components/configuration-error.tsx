import { View } from "react-native";
import { BrandMark } from "@/components/brand-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeArea } from "@/components/ui/safe-area";
import { Text } from "@/components/ui/text";

export function ConfigurationError({ message }: { message: string }) {
  return (
    <SafeArea>
      <View className="flex-1 justify-center gap-6 p-6">
        <BrandMark size="lg" />
        <Card className="rounded-2xl p-0">
          <CardHeader className="gap-2.5 p-6 pb-0">
            <Text className="tracking-wider text-primary" variant="small">
              SETUP NEEDED
            </Text>
            <CardTitle className="text-left font-extrabold" selectable>
              This build is not configured yet.
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2.5">
            <CardDescription className="text-base leading-6" selectable>
              {message}
            </CardDescription>
          </CardContent>
        </Card>
      </View>
    </SafeArea>
  );
}
