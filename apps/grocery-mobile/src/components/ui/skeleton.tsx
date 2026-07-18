import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  const opacity = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(withTiming(0.4, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      className={cn("rounded-md bg-muted", className)}
      style={animatedStyle}
      {...props}
    />
  );
}
