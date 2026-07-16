import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import { Check } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "children"> & {
  indicatorClassName?: string;
};

function Checkbox({
  checked = false,
  className,
  disabled,
  indicatorClassName,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      className="min-h-12 min-w-12 items-center justify-center"
      disabled={Boolean(disabled)}
      onCheckedChange={onCheckedChange ?? (() => undefined)}
      {...props}
    >
      <View
        className={cn(
          "size-6 items-center justify-center rounded-full border",
          checked ? "border-primary bg-primary" : "border-input bg-background",
          disabled && "opacity-50",
          className,
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Icon
            as={Check}
            className={cn("size-4 text-primary-foreground", indicatorClassName)}
            strokeWidth={3}
          />
        </CheckboxPrimitive.Indicator>
      </View>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
export type { CheckboxProps };
