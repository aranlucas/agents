import React from "react";
import { View, Text } from "react-native";
import { cn } from "@/lib/utils";

export interface LabeledSeparatorProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
  label: string;
  labelClassName?: string;
}

export function LabeledSeparator({
  label,
  className,
  labelClassName,
  ...props
}: LabeledSeparatorProps) {
  return (
    <View className={cn("my-2 flex-row items-center gap-3", className)} {...props}>
      <View className="h-px flex-1 bg-border" />
      <Text className={cn("text-sm text-muted-foreground", labelClassName)}>{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
