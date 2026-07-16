import { useEffect, useRef } from "react";
import { Animated } from "react-native";

export function StreamingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { duration: 500, toValue: 0, useNativeDriver: true }),
        Animated.timing(opacity, { duration: 500, toValue: 1, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.Text style={{ opacity }}>▍</Animated.Text>;
}
