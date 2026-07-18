import React from "react";
import { Text, Pressable } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react-native";
import { useThemeColor } from "@/hooks/use-theme-color";
import { cn } from "@/lib/utils";

const chipVariants = cva("min-h-12 flex-row items-center rounded-full", {
  variants: {
    variant: {
      default: "bg-primary",
      secondary: "bg-secondary",
      outline: "border border-input bg-transparent",
      destructive: "bg-destructive",
    },
    size: {
      sm: "px-2.5 py-1 gap-1",
      md: "px-3 py-1.5 gap-1.5",
      lg: "px-4 py-2 gap-2",
    },
  },
  defaultVariants: { variant: "default", size: "md" },
});

const chipTextVariants = cva("font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      destructive: "text-destructive-foreground",
    },
    size: { sm: "text-xs", md: "text-sm", lg: "text-base" },
  },
  defaultVariants: { variant: "default", size: "md" },
});

export interface ChipProps
  extends React.ComponentPropsWithoutRef<typeof Pressable>, VariantProps<typeof chipVariants> {
  className?: string;
  textClassName?: string;
  children: string;
  selected?: boolean;
  onClose?: () => void;
}

export function Chip({
  variant,
  size,
  className,
  textClassName,
  children,
  selected,
  onClose,
  ...props
}: ChipProps) {
  const v = selected ? "default" : (variant ?? "outline");
  const closeColor = useThemeColor(
    v === "outline"
      ? "--color-muted-foreground"
      : v === "default"
        ? "--color-primary-foreground"
        : v === "secondary"
          ? "--color-secondary-foreground"
          : "--color-destructive-foreground",
    "#17201a",
  );
  return (
    <Pressable
      className={cn(chipVariants({ variant: v, size }), className)}
      hitSlop={3}
      accessible={true}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      {...props}
    >
      <Text className={cn(chipTextVariants({ variant: v, size }), textClassName)}>{children}</Text>
      {onClose && (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${children}`}
          className="ms-0.5"
        >
          <X size={12} color={closeColor} />
        </Pressable>
      )}
    </Pressable>
  );
}
