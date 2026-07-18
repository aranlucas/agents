import React from "react";
import { ScrollView } from "react-native";
import { cn } from "@/lib/utils";

type ScreenProps = React.ComponentPropsWithoutRef<typeof ScrollView> & {
  className?: string;
  contentContainerClassName?: string;
};

export function Screen({ className, contentContainerClassName, ...props }: ScreenProps) {
  return (
    <ScrollView
      className={cn("w-full max-w-3xl flex-1 self-center", className)}
      automaticallyAdjustKeyboardInsets={process.env.EXPO_OS === "ios"}
      contentContainerClassName={cn("gap-4 p-4 pb-10 sm:p-6 sm:pb-12", contentContainerClassName)}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode={process.env.EXPO_OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  );
}
