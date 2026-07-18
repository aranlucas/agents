import React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <View className={cn("items-center justify-center px-8 py-16", className)} {...props}>
      {icon && <View className="mb-4">{icon}</View>}
      <Text className="mb-1 text-center" variant="large">
        {title}
      </Text>
      {description && (
        <Text className="mb-6 max-w-70 text-center" variant="muted">
          {description}
        </Text>
      )}
      {action && (
        <Button onPress={action.onPress} size="lg">
          {action.label}
        </Button>
      )}
    </View>
  );
}
