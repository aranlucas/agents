import React from "react";
import { View, Text, useColorScheme } from "react-native";
import { cn } from "@/lib/utils";

export interface ChartTooltipProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
  label?: string;
  value?: string | number;
  indicator?: "line" | "dot" | "dashed";
  color?: string;
  items?: { label: string; value: string | number; color: string }[];
}

export function ChartTooltip({
  className,
  label,
  value,
  indicator = "dot",
  color,
  items,
  ...props
}: ChartTooltipProps) {
  const dark = useColorScheme() === "dark";
  const resolvedColor = color ?? (dark ? "#fafafa" : "#18181b");
  const indicatorEl = (c: string) =>
    indicator === "line" ? (
      <View className="h-3 w-1 rounded-full" style={{ backgroundColor: c }} />
    ) : indicator === "dashed" ? (
      <View className="h-3 w-1 rounded-full" style={{ backgroundColor: c, opacity: 0.5 }} />
    ) : (
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
    );

  return (
    <View
      className={cn("rounded-lg border border-border bg-card px-3 py-2 shadow-sm", className)}
      accessibilityRole="summary"
      {...props}
    >
      {label && <Text className="mb-1 text-xs text-muted-foreground">{label}</Text>}
      {items ? (
        items.map((item, i) => (
          <View key={i} className="flex-row items-center gap-2 py-0.5">
            {indicatorEl(item.color)}
            <Text className="text-xs text-muted-foreground">{item.label}</Text>
            <Text className="ms-auto text-xs font-medium text-foreground">{item.value}</Text>
          </View>
        ))
      ) : (
        <View className="flex-row items-center gap-2">
          {indicatorEl(resolvedColor)}
          <Text className="text-sm font-medium text-foreground">{value}</Text>
        </View>
      )}
    </View>
  );
}
