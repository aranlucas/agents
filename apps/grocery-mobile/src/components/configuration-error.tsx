import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, View } from "react-native";
import { BrandMark, Card } from "@/components/ui";
import { colors } from "@/lib/theme";

export function ConfigurationError({ message }: { message: string }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <BrandMark size={52} />
        <Card style={styles.card}>
          <Text style={styles.eyebrow}>SETUP NEEDED</Text>
          <Text selectable style={styles.title}>
            This build is not configured yet.
          </Text>
          <Text selectable style={styles.body}>
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
  card: { padding: 24, gap: 10 },
  eyebrow: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
});
