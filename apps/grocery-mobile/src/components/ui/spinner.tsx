import { cn } from "@/lib/utils";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";

const sizeMap = { sm: "small", md: "small", lg: "large" } as const;

type SpinnerProps = React.ComponentProps<typeof View> & {
  indicatorClassName?: string;
  size?: keyof typeof sizeMap;
};

function Spinner({
  accessibilityLabel = "Loading",
  className,
  indicatorClassName,
  size = "md",
  ...props
}: SpinnerProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      className={cn("items-center justify-center", className)}
      role="progressbar"
      {...props}
    >
      <ActivityIndicator
        colorClassName={cn("accent-primary", indicatorClassName)}
        size={sizeMap[size]}
      />
    </View>
  );
}

export { Spinner };
export type { SpinnerProps };
