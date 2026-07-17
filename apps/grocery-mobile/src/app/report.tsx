import { useAuth } from "@clerk/clerk-expo";
import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { buildReportMailto, type ReportCategory } from "@/lib/report";

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
      className="w-full max-w-3xl flex-1 self-center bg-background"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-3.5 p-5 pb-10"
    >
      <View className="mb-2 gap-2">
        <Text
          className="border-b border-border pb-2 text-left font-extrabold"
          selectable
          variant="h2"
        >
          Tell us what went wrong.
        </Text>
        <Text className="leading-6 text-muted-foreground" selectable>
          We’ll open your email app with a report you can review before sending.
        </Text>
      </View>

      <Label>What happened?</Label>
      <View className="flex-row flex-wrap gap-2">
        {CATEGORIES.map((item) => {
          const selected = item === category;
          return (
            <Chip
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              selected={selected}
              onPress={() => setCategory(item)}
            >
              {item}
            </Chip>
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

      <View className="rounded-2xl bg-muted p-3.5">
        <Text className="leading-5" selectable variant="muted">
          Do not include passwords, payment details, health information, or other sensitive data.
        </Text>
      </View>
      {error ? <Alert title={error} variant="destructive" /> : null}
      <Button size="lg" variant="secondary" onPress={() => void submit()}>
        Review email report
      </Button>
    </ScrollView>
  );
}
