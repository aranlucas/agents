import React from "react";
import { View, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react-native";
import { cn } from "@/lib/utils";

export interface TimelineProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
  children?: React.ReactNode;
}

export function Timeline({ className, children, ...props }: TimelineProps) {
  return (
    <View className={cn("", className)} accessibilityRole="list" {...props}>
      {children}
    </View>
  );
}

const dotVariants = cva("h-3 w-3 rounded-full", {
  variants: {
    variant: {
      default: "bg-primary",
      completed: "bg-green-500",
      active: "bg-primary",
      pending: "bg-muted-foreground/40",
      destructive: "bg-destructive",
      success: "bg-green-500",
      muted: "bg-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface TimelineItemProps
  extends React.ComponentPropsWithoutRef<typeof View>, VariantProps<typeof dotVariants> {
  className?: string;
  title: string;
  description?: string;
  time?: string;
  icon?: React.ReactNode;
  isLast?: boolean;
}

export function TimelineItem({
  variant,
  className,
  title,
  description,
  time,
  icon,
  isLast,
  ...props
}: TimelineItemProps) {
  const isActive = variant === "active";

  return (
    <View className={cn("flex-row", className)} {...props}>
      {/* Dot + Line */}
      <View className="w-6 items-center" style={{ paddingTop: 4 }}>
        {icon ?? (
          <View className={cn(dotVariants({ variant }), isActive && "border-2 border-primary/30")}>
            {variant === "completed" && (
              <View className="flex-1 items-center justify-center">
                <Check size={8} color="#ffffff" strokeWidth={3} />
              </View>
            )}
          </View>
        )}
        {!isLast && <View className="mt-1.5 mb-0 w-px flex-1 bg-border" />}
      </View>

      {/* Content */}
      <View className={cn("ms-3 flex-1 pb-6", isLast && "pb-0")}>
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className={cn(
              "flex-1 text-sm font-medium",
              variant === "pending" ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {title}
          </Text>
          {time && <Text className="text-[11px] text-muted-foreground">{time}</Text>}
        </View>
        {description && (
          <Text
            className={cn(
              "mt-1 text-[13px] leading-5",
              variant === "pending" ? "text-muted-foreground/60" : "text-muted-foreground",
            )}
          >
            {description}
          </Text>
        )}
      </View>
    </View>
  );
}
