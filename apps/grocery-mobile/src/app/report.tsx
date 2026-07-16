import { useAuth } from "@clerk/clerk-expo";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";
import { InlineError, PrimaryButton } from "@/components/ui";
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
        <Text selectable style={styles.title}>
          Tell us what went wrong.
        </Text>
        <Text selectable style={styles.subtitle}>
          We’ll open your email app with a report you can review before sending.
        </Text>
      </View>

      <Text style={styles.label}>What happened?</Text>
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

      <Text style={styles.label}>Details</Text>
      <TextInput
        accessibilityLabel="Report details"
        maxLength={3000}
        multiline
        placeholder="What did you expect, and what happened instead?"
        placeholderTextColor="#7b847c"
        style={styles.input}
        textAlignVertical="top"
        value={details}
        onChangeText={setDetails}
      />
      <Text style={styles.counter}>{details.length}/3000</Text>

      <View style={styles.privacy}>
        <Text selectable style={styles.privacyText}>
          Do not include passwords, payment details, health information, or other sensitive data.
        </Text>
      </View>
      {error ? <InlineError message={error} /> : null}
      <PrimaryButton onPress={() => void submit()}>Review email report</PrimaryButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 13, paddingBottom: 40 },
  intro: { gap: 7, marginBottom: 7 },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  label: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "800", marginTop: 3 },
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
  input: {
    minHeight: 160,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    padding: 15,
  },
  counter: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: -7 },
  privacy: { backgroundColor: colors.surfaceMuted, borderRadius: 14, padding: 13 },
  privacyText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
