import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react-native";
import * as React from "react";
import { Pressable } from "react-native";

const chipVariants = cva("min-h-8 flex-row items-center rounded-full", {
  variants: {
    variant: {
      default: "bg-primary",
      secondary: "bg-secondary",
      outline: "border border-input bg-card",
      destructive: "bg-destructive",
    },
    size: {
      sm: "gap-1 px-2.5 py-1",
      md: "gap-1.5 px-3 py-1.5",
      lg: "gap-2 px-4 py-2",
    },
  },
  defaultVariants: { variant: "outline", size: "md" },
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
  defaultVariants: { variant: "outline", size: "md" },
});

type ChipProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof chipVariants> & {
    children: string;
    onClose?: () => void;
    selected?: boolean;
    textClassName?: string;
  };

function Chip({
  accessibilityRole,
  accessibilityState,
  children,
  className,
  onClose,
  role,
  selected = false,
  size,
  textClassName,
  variant,
  ...props
}: ChipProps) {
  const resolvedVariant = selected ? "default" : variant;
  const resolvedRole = (role ?? accessibilityRole ?? "button") as React.ComponentProps<
    typeof Pressable
  >["role"];
  const resolvedState =
    resolvedRole === "radio" || resolvedRole === "checkbox"
      ? { ...accessibilityState, checked: selected }
      : { ...accessibilityState, selected };
  const iconClassName =
    resolvedVariant === "default"
      ? "text-primary-foreground"
      : resolvedVariant === "secondary"
        ? "text-secondary-foreground"
        : resolvedVariant === "destructive"
          ? "text-destructive-foreground"
          : "text-muted-foreground";

  return (
    <Pressable
      accessibilityState={resolvedState}
      className={cn(chipVariants({ size, variant: resolvedVariant }), className)}
      role={resolvedRole}
      {...props}
    >
      <Text className={cn(chipTextVariants({ size, variant: resolvedVariant }), textClassName)}>
        {children}
      </Text>
      {onClose ? (
        <Pressable
          accessibilityLabel={`Remove ${children}`}
          className="ms-0.5"
          hitSlop={8}
          role="button"
          onPress={onClose}
        >
          <Icon as={X} className={iconClassName} size={12} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export { Chip, chipTextVariants, chipVariants };
export type { ChipProps };
