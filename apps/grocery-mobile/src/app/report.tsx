import { useAuth } from "@clerk/expo";
import { Linking, View } from "react-native";
import { useForm, useWatch } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FormField, FormTextarea } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { buildReportMailto, type ReportCategory } from "@/lib/report";

const CATEGORIES: ReportCategory[] = ["Wrong item", "Connection issue", "App problem", "Other"];
type ReportFormValues = { category: ReportCategory; details: string };

export default function ReportScreen() {
  const { userId } = useAuth();
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReportFormValues>({
    defaultValues: { category: "Wrong item", details: "" },
  });
  const details = useWatch({ control, name: "details" });

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    try {
      const url = buildReportMailto({ ...values, userId });
      if (!(await Linking.canOpenURL(url))) throw new Error("Email is unavailable");
      await Linking.openURL(url);
    } catch {
      setError("root.server", {
        message: "No email app is available. Visit Support from Account to contact us instead.",
      });
    }
  });

  return (
    <Screen>
      <View className="gap-2">
        <Text selectable variant="h3">
          Tell us what went wrong.
        </Text>
        <Text className="text-muted-foreground" selectable>
          We’ll open your email app with a report you can review before sending.
        </Text>
      </View>

      <Label>What happened?</Label>
      <FormField
        control={control}
        name="category"
        render={({ field }) => (
          <View
            accessibilityLabel="What happened?"
            accessibilityRole="radiogroup"
            className="flex-row flex-wrap gap-2"
          >
            {CATEGORIES.map((item) => {
              const selected = item === field.value;
              return (
                <Chip
                  key={item}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  selected={selected}
                  onPress={() => field.onChange(item)}
                >
                  {item}
                </Chip>
              );
            })}
          </View>
        )}
      />

      <View className="gap-1">
        <FormTextarea
          className="min-h-40"
          control={control}
          label="Details"
          maxLength={3000}
          name="details"
          placeholder="What did you expect, and what happened instead?"
        />
        <Text className="text-right tabular-nums" variant="muted">
          {details.length}/3000
        </Text>
      </View>

      <Alert title="Protect your privacy">
        <AlertDescription selectable>
          Do not include passwords, payment details, health information, or other sensitive data.
        </AlertDescription>
      </Alert>
      {errors.root?.server?.message ? (
        <Alert title={errors.root.server.message} variant="destructive" />
      ) : null}
      <Button loading={isSubmitting} size="lg" variant="secondary" onPress={() => void submit()}>
        Review email report
      </Button>
    </Screen>
  );
}
