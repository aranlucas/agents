import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, View } from "react-native";
import { BrandMark } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { colors } from "@/lib/theme";

export function ConfigurationError({ message }: { message: string }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <BrandMark size={52} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wrap: { flex: 1, justifyContent: "center", padding: 24, gap: 24 },
});
