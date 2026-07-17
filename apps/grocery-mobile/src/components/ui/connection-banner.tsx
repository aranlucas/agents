import React from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";
import { entering, exiting } from "@/components/ui/animate";
import { cn } from "@/lib/utils";

export interface ConnectionBannerProps {
  className?: string;
  /** Undefined = connectivity not yet known; the banner stays hidden. */
  connected?: boolean;
  offlineText?: string;
  onlineText?: string;
}

export function ConnectionBanner({
  className,
  connected,
  offlineText = "No internet connection",
  onlineText = "Back online",
}: ConnectionBannerProps) {
  if (connected === undefined) return null;

  return (
    <Animated.View
      entering={entering.slideInDown}
      exiting={exiting.slideOutUp}
      className={cn(
        "items-center px-4 py-2",
        connected ? "bg-green-600" : "bg-destructive",
        className,
      )}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-sm font-medium text-white">{connected ? onlineText : offlineText}</Text>
    </Animated.View>
  );
}
