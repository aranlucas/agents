import { cn } from "@/lib/utils";
import * as React from "react";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

function Skeleton({ className, style, ...props }: React.ComponentProps<typeof Animated.View>) {
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(withTiming(0.45, { duration: 1_000 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      className={cn("rounded-md bg-accent", className)}
      style={[animatedStyle, style]}
      {...props}
    />
  );
}

export { Skeleton };
