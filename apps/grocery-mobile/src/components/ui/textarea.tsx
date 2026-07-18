import React from "react";
import { View, TextInput, useColorScheme } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { useThemeColor } from "@/hooks/use-theme-color";
import { cn } from "@/lib/utils";

// Padding lives on the wrapping View (a raw TextInput doesn't honor `px-*`
// reliably), so the text inset matches Input and is consistent on all sides —
// under both NativeWind and Uniwind.
const textareaVariants = cva("rounded-md border px-4 py-3 min-h-24", {
  variants: {
    variant: {
      default: "border-input bg-background",
      ghost: "border-transparent bg-transparent",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface TextareaProps
  extends React.ComponentPropsWithoutRef<typeof TextInput>, VariantProps<typeof textareaVariants> {
  className?: string;
}

export const Textarea = React.forwardRef<React.ElementRef<typeof TextInput>, TextareaProps>(
  function Textarea({ variant, className, ...props }, ref) {
    const dark = useColorScheme() === "dark";
    const caret = useThemeColor("--color-foreground", dark ? "#f7f8f2" : "#17201a");
    const placeholder = useThemeColor("--color-muted-foreground", dark ? "#a9b4aa" : "#667067");
    return (
      <View className={cn(textareaVariants({ variant }), className)}>
        <TextInput
          ref={ref}
          className="flex-1 p-0 text-base text-foreground placeholder:text-muted-foreground"
          placeholderTextColor={placeholder}
          keyboardAppearance={dark ? "dark" : "light"}
          selectionColor={caret}
          cursorColor={caret}
          multiline
          textAlignVertical="top"
          {...props}
        />
      </View>
    );
  },
);
