import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
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
import { Input } from "@/components/ui/input";
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
  const [title, setTitle] = useState(defaultTitle);
  const [householdId, setHouseholdId] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setHouseholdId(undefined);
  }, [defaultTitle, open]);

  const resource = kind === "list" ? "grocery list" : "recipe";
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
          <Input
            accessibilityLabel={`${kind === "list" ? "List" : "Recipe"} title`}
            autoCapitalize="sentences"
            onChangeText={setTitle}
            placeholder={kind === "list" ? "Weekly groceries" : "Recipe title"}
            value={title}
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
              <Chip onPress={() => setHouseholdId(undefined)} selected={!householdId}>
                Personal
              </Chip>
              {households.map((household) => (
                <Chip
                  key={household.id}
                  onPress={() => setHouseholdId(household.id)}
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
          <AlertDialogAction
            disabled={saving || !title.trim()}
            onPress={() => onConfirm(title.trim(), householdId)}
          >
            {saving ? "Saving…" : "Save"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
