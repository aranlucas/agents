import React from "react";
import { View } from "react-native";
import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import { Check } from "lucide-react-native";
import { useThemeColor } from "@/hooks/use-theme-color";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "checked" | "disabled" | "onCheckedChange"
> {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export function Checkbox({
  checked = false,
  onCheckedChange,
  className,
  disabled,
  ...props
}: CheckboxProps) {
  const checkColor = useThemeColor("--color-primary-foreground", "#ffffff");
  return (
    <CheckboxPrimitive.Root
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      className="min-h-14 min-w-14 items-center justify-center"
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange ?? (() => {})}
      {...props}
    >
      <View
        className={cn(
          "h-5 w-5 items-center justify-center rounded border",
          checked ? "border-primary bg-primary" : "border-input bg-background",
          disabled && "opacity-50",
          className,
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Check size={14} color={checkColor} strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </View>
    </CheckboxPrimitive.Root>
  );
}
