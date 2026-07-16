import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import * as React from "react";
import { View } from "react-native";

type EmptyStateProps = React.ComponentProps<typeof View> & {
  action?: { label: string; onPress: () => void };
  description?: string;
  icon?: React.ReactNode;
  title: string;
};

function EmptyState({ action, className, description, icon, title, ...props }: EmptyStateProps) {
  return (
    <View className={cn("items-center justify-center gap-3 px-7 py-10", className)} {...props}>
      {icon ? (
        <View className="mb-1 size-16 items-center justify-center rounded-2xl bg-muted">
          {icon}
        </View>
      ) : null}
      <Text className="text-center font-extrabold" selectable variant="h3">
        {title}
      </Text>
      {description ? (
        <Text className="max-w-80 text-center leading-6 text-muted-foreground" selectable>
          {description}
        </Text>
      ) : null}
      {action ? (
        <Button className="mt-1" size="lg" variant="secondary" onPress={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

export { EmptyState };
export type { EmptyStateProps };
