import React, { useEffect, useState } from "react";
import { View, Pressable, Modal } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { springs, duration } from "@/components/ui/animate";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right";
  children: React.ReactNode;
}

export function Drawer({ open, onOpenChange, side = "left", children }: DrawerProps) {
  const [closing, setClosing] = useState(false);
  const translate = useSharedValue(side === "left" ? -300 : 300);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      translate.value = withSpring(0, springs.snappy);
      opacity.value = withTiming(0.5, { duration: duration.normal });
      return;
    }
    if (!closing) {
      translate.value = side === "left" ? -300 : 300;
      opacity.value = 0;
      return;
    }
    translate.value = withTiming(side === "left" ? -300 : 300, { duration: duration.normal });
    opacity.value = withTiming(0, { duration: duration.normal });
    const t = setTimeout(() => setClosing(false), duration.normal);
    return () => clearTimeout(t);
  }, [closing, open, side, translate, opacity]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));

  const close = () => {
    if (!open || closing) return;
    setClosing(true);
    onOpenChange(false);
  };

  return (
    <Modal visible={open || closing} transparent animationType="none" onRequestClose={close}>
      <Pressable
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        onPress={close}
        accessible={false}
      >
        <Animated.View style={[{ flex: 1, backgroundColor: "#000000" }, overlayStyle]} />
      </Pressable>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 288,
            ...(side === "left" ? { left: 0 } : { right: 0 }),
          },
          drawerStyle,
        ]}
      >
        <View
          className={cn(
            "flex-1 bg-card",
            side === "left" ? "border-r border-border" : "border-l border-border",
          )}
          accessibilityRole="menu"
        >
          {children}
        </View>
      </Animated.View>
    </Modal>
  );
}

export interface DrawerContentProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
  children?: React.ReactNode;
}

export function DrawerContent({ className, ...props }: DrawerContentProps) {
  return <View className={cn("flex-1 p-4", className)} {...props} />;
}
