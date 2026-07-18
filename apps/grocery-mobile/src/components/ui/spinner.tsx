import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useThemeColor } from "@/hooks/use-theme-color";
import { cn } from "@/lib/utils";

const sizeMap = { sm: "small", md: "small", lg: "large" } as const;

export interface SpinnerProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
  size?: "sm" | "md" | "lg";
  color?: string;
}

export function Spinner({ size = "md", color, className, ...props }: SpinnerProps) {
  const foreground = useThemeColor("--color-foreground", "#17201a");
  return (
    <View className={cn("items-center justify-center", className)} {...props}>
      <ActivityIndicator
        size={sizeMap[size]}
        color={color ?? foreground}
        accessibilityRole="progressbar"
      />
    </View>
  );
}
