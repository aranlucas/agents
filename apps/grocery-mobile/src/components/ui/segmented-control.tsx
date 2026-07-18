import React from "react";
import { View, Pressable, Text } from "react-native";
import { cn } from "@/lib/utils";

const heights = { sm: 36, md: 44, lg: 56 } as const;

export type SegmentedOption<T extends string | number> = {
  value: T;
  label?: string;
  disabled?: boolean;
};

export interface SegmentedControlProps<T extends string | number = string> extends Omit<
  React.ComponentProps<typeof View>,
  "children"
> {
  className?: string;
  options: T[] | SegmentedOption<T>[];
  labels?: string[];
  value: T;
  onValueChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
}

function isOptionObject<T extends string | number>(
  o: T | SegmentedOption<T>,
): o is SegmentedOption<T> {
  return typeof o === "object" && o !== null && "value" in (o as object);
}

export function SegmentedControl<T extends string | number = string>({
  size = "md",
  className,
  style,
  options,
  labels,
  value,
  onValueChange,
  ...rest
}: SegmentedControlProps<T>) {
  const items: SegmentedOption<T>[] = options.map((o, i) =>
    isOptionObject(o)
      ? { value: o.value, label: o.label ?? String(o.value), disabled: o.disabled }
      : { value: o, label: labels?.[i] ?? String(o) },
  );

  return (
    <View
      className={cn("rounded-lg bg-muted", className)}
      style={[{ height: heights[size], padding: 4, flexDirection: "row", borderRadius: 8 }, style]}
      accessibilityRole="tablist"
      {...rest}
    >
      {items.map(({ value: v, label, disabled }) => {
        const active = v === value;
        return (
          <Pressable
            key={String(v)}
            className={cn(
              "flex-1 items-center justify-center rounded-md",
              active && "bg-card shadow-sm",
              disabled && "opacity-50",
            )}
            disabled={disabled}
            onPress={() => {
              if (!active) onValueChange(v);
            }}
            accessible={true}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: !!disabled }}
          >
            <Text
              className={cn(
                "text-sm font-medium",
                active ? "text-card-foreground" : "text-muted-foreground",
              )}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
