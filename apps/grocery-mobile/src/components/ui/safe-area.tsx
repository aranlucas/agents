import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";
import { cn } from "@/lib/utils";

const UniwindSafeAreaView = withUniwind(SafeAreaView);

const safeAreaVariants = cva("flex-1", {
  variants: {
    variant: {
      card: "bg-card",
      default: "bg-background",
      transparent: "bg-transparent",
    },
  },
  defaultVariants: { variant: "default" },
});

type SafeAreaProps = React.ComponentProps<typeof SafeAreaView> &
  VariantProps<typeof safeAreaVariants>;

function SafeArea({ variant, className, ...props }: SafeAreaProps) {
  return (
    <UniwindSafeAreaView className={cn(safeAreaVariants({ variant }), className)} {...props} />
  );
}

export { SafeArea };
export type { SafeAreaProps };
