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
  withDelay,
} from "react-native-reanimated";
import { cn } from "@/lib/utils";

function Dot({ delay, reduceMotion }: { delay: number; reduceMotion: boolean }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(translateY);
      translateY.value = 0;
      return;
    }
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

  return <Animated.View style={style} className="h-2 w-2 rounded-full bg-muted-foreground" />;
}

export interface TypingIndicatorProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
}

export function TypingIndicator({ className, ...props }: TypingIndicatorProps) {
  const reduceMotion = useReducedMotion();
  return (
    <View
      className={cn(
        "flex-row items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5",
        className,
      )}
      accessibilityLabel="Typing"
      {...props}
    >
      <Dot delay={0} reduceMotion={reduceMotion} />
      <Dot delay={150} reduceMotion={reduceMotion} />
      <Dot delay={300} reduceMotion={reduceMotion} />
    </View>
  );
}
