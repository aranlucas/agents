import * as React from "react";
import { KeyboardAvoidingView } from "react-native";
import { withUniwind } from "uniwind";
import { cn } from "@/lib/utils";

const UniwindKeyboardAvoidingView = withUniwind(KeyboardAvoidingView);

type KeyboardViewProps = React.ComponentProps<typeof KeyboardAvoidingView> & {
  offset?: number;
};

function KeyboardView({ className, offset, behavior, ...props }: KeyboardViewProps) {
  return (
    <UniwindKeyboardAvoidingView
      behavior={behavior ?? (process.env.EXPO_OS === "ios" ? "padding" : undefined)}
      className={cn("flex-1", className)}
      keyboardVerticalOffset={offset}
      {...props}
    />
  );
}

export { KeyboardView };
export type { KeyboardViewProps };
