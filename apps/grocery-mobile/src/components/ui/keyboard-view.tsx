import type { ComponentPropsWithoutRef } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { cn } from "@/lib/utils";

export interface KeyboardViewProps extends ComponentPropsWithoutRef<typeof KeyboardAvoidingView> {
  className?: string;
  offset?: number;
}

const defaultBehavior = process.env.EXPO_OS === "ios" ? "padding" : undefined;

export function KeyboardView({ className, offset, behavior, ...props }: KeyboardViewProps) {
  return (
    <KeyboardAvoidingView
      automaticOffset
      className={cn("flex-1", className)}
      behavior={behavior ?? defaultBehavior}
      keyboardVerticalOffset={offset}
      {...props}
    />
  );
}
