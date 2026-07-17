import React from "react";
import { View, Text, Pressable } from "react-native";
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
      <Text className="mb-1 text-center text-lg font-semibold text-foreground">{title}</Text>
      {description && (
        <Text className="mb-6 max-w-[280px] text-center text-sm text-muted-foreground">
          {description}
        </Text>
      )}
      {action && (
        <Pressable
          onPress={action.onPress}
          className="min-h-12 items-center justify-center rounded-lg bg-primary px-6 py-2.5"
          accessible={true}
          accessibilityRole="button"
        >
          <Text className="text-sm font-medium text-primary-foreground">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
