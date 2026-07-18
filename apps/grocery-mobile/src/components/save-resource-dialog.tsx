import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useForm, useWatch } from "react-hook-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { Chip } from "@/components/ui/chip";
import { FormInput } from "@/components/ui/form";
import { Text } from "@/components/ui/text";
import type { Household } from "@/lib/household-api";

export function SaveResourceDialog({
  defaultTitle,
  error,
  households,
  kind,
  onConfirm,
  onOpenChange,
  open,
  saving,
}: {
  defaultTitle: string;
  error?: string;
  households: Household[];
  kind: "list" | "recipe";
  onConfirm: (title: string, householdId?: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  saving: boolean;
}) {
  const { control, handleSubmit, reset, setValue } = useForm<{
    title: string;
    householdId?: string;
  }>({ defaultValues: { title: defaultTitle, householdId: undefined } });
  const householdId = useWatch({ control, name: "householdId" });

  useEffect(() => {
    if (!open) return;
    reset({ title: defaultTitle, householdId: undefined });
  }, [defaultTitle, open, reset]);

  const resource = kind === "list" ? "grocery list" : "recipe";
  const submit = handleSubmit(({ title, householdId }) => onConfirm(title.trim(), householdId));
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="w-88 max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Save {resource}</AlertDialogTitle>
          <AlertDialogDescription>
            Keep it personal or make it available to everyone in one of your households.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <View className="gap-3">
          <FormInput
            accessibilityLabel={`${kind === "list" ? "List" : "Recipe"} title`}
            autoCapitalize="sentences"
            control={control}
            name="title"
            placeholder={kind === "list" ? "Weekly groceries" : "Recipe title"}
            rules={{ validate: (value) => value.trim().length > 0 || "Add a title." }}
          />
          <View className="gap-2">
            <Text className="font-semibold" variant="small">
              Save to
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              <Chip onPress={() => setValue("householdId", undefined)} selected={!householdId}>
                Personal
              </Chip>
              {households.map((household) => (
                <Chip
                  key={household.id}
                  onPress={() => setValue("householdId", household.id)}
                  selected={householdId === household.id}
                >
                  {household.name}
                </Chip>
              ))}
            </ScrollView>
          </View>
          {error ? <Alert title={error} variant="destructive" /> : null}
        </View>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving} onPress={() => onOpenChange(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction disabled={saving} onPress={() => void submit()}>
            {saving ? "Saving…" : "Save"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
