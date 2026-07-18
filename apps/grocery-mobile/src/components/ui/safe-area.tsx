import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { cva, type VariantProps } from "class-variance-authority";
import { withUniwind } from "uniwind";
import { cn } from "@/lib/utils";

const UniwindSafeAreaView = withUniwind(SafeAreaView);

const safeAreaVariants = cva("flex-1", {
  variants: {
    variant: {
      default: "bg-background",
      card: "bg-card",
      transparent: "bg-transparent",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface SafeAreaProps
  extends
    React.ComponentPropsWithoutRef<typeof SafeAreaView>,
    VariantProps<typeof safeAreaVariants> {
  className?: string;
  children?: React.ReactNode;
}

export function SafeArea({ variant, className, children, style, ...props }: SafeAreaProps) {
  return (
    <UniwindSafeAreaView
      className={cn(safeAreaVariants({ variant }), className)}
      style={style}
      {...props}
    >
      {children}
    </UniwindSafeAreaView>
  );
}
