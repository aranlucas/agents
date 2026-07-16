import { cn } from "@/lib/utils";
import * as React from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

function Dot({ delay }: { delay: number }) {
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(0);

  React.useEffect(() => {
    if (reduceMotion) return;
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })),
        -1,
      ),
    );
    return () => cancelAnimation(translateY);
  }, [delay, reduceMotion, translateY]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return <Animated.View className="size-2 rounded-full bg-muted-foreground" style={style} />;
}

type TypingIndicatorProps = React.ComponentProps<typeof View>;

function TypingIndicator({ className, ...props }: TypingIndicatorProps) {
  return (
    <View
      accessibilityLabel="Grocery Agent is typing"
      className={cn(
        "flex-row items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-card px-4 py-2.5",
        className,
      )}
      role="progressbar"
      {...props}
    >
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </View>
  );
}

export { TypingIndicator };
export type { TypingIndicatorProps };
