import { ScrollView } from "react-native";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SafeArea } from "@/components/ui/safe-area";

export function ConfigurationError({ message }: { message: string }) {
  return (
    <SafeArea>
      <ScrollView
        className="w-full max-w-md self-center"
        contentContainerClassName="flex-grow justify-center gap-6 p-6"
        contentInsetAdjustmentBehavior="automatic"
      >
        <BrandMark size="lg" />
        <Card>
          <CardHeader className="gap-2.5 pb-0">
            <Badge className="self-start" variant="outline">
              Setup needed
            </Badge>
            <CardTitle selectable>This build is not configured yet.</CardTitle>
          </CardHeader>
          <CardContent className="pt-2.5">
            <CardDescription selectable>{message}</CardDescription>
          </CardContent>
        </Card>
      </ScrollView>
    </SafeArea>
  );
}
