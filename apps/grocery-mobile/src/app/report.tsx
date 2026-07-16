import { useAuth } from "@clerk/clerk-expo";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Check } from "lucide-react-native";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { buildReportMailto, type ReportCategory } from "@/lib/report";
import { colors } from "@/lib/theme";

const CATEGORIES: ReportCategory[] = ["Wrong item", "Connection issue", "App problem", "Other"];

export default function ReportScreen() {
  const { userId } = useAuth();
  const [category, setCategory] = useState<ReportCategory>("Wrong item");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    try {
      const url = buildReportMailto({ category, details, userId });
      if (!(await Linking.canOpenURL(url))) throw new Error("Email is unavailable");
      await Linking.openURL(url);
    } catch {
      setError("No email app is available. Visit Support from Account to contact us instead.");
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <View style={styles.intro}>
        <Text className="text-left font-extrabold" selectable variant="h2">
          Tell us what went wrong.
        </Text>
        <Text className="leading-6 text-muted-foreground" selectable>
          We’ll open your email app with a report you can review before sending.
        </Text>
      </View>

      <Label>What happened?</Label>
      <View style={styles.categories}>
        {CATEGORIES.map((item) => {
          const selected = item === category;
          return (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setCategory(item)}
              style={[styles.category, selected && styles.categorySelected]}
            >
              {selected ? <Check color={colors.green} size={16} /> : null}
              <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Label>Details</Label>
      <Textarea
        accessibilityLabel="Report details"
        className="min-h-40 rounded-2xl bg-card p-4 leading-6"
        maxLength={3000}
        placeholder="What did you expect, and what happened instead?"
        value={details}
        onChangeText={setDetails}
      />
      <Text className="-mt-2 text-right tabular-nums" variant="muted">
        {details.length}/3000
      </Text>

      <View style={styles.privacy}>
        <Text className="text-xs leading-5 text-muted-foreground" selectable>
          Do not include passwords, payment details, health information, or other sensitive data.
        </Text>
      </View>
      {error ? <ErrorAlert message={error} /> : null}
      <Button size="lg" onPress={() => void submit()}>
        Review email report
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 13, paddingBottom: 40 },
  intro: { gap: 7, marginBottom: 7 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  categorySelected: { borderColor: colors.green, backgroundColor: colors.surfaceMuted },
  categoryText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  categoryTextSelected: { color: colors.forest },
  privacy: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 13 },
});
