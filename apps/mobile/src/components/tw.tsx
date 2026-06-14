import { BlurView as EXBlurView } from "expo-blur";
import { GlassView as XGlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Image as XImage } from "expo-image";
import { StyleSheet, type ViewStyle } from "react-native";
import { withUniwind } from "uniwind";
import type { ComponentProps, ReactNode } from "react";

import { KeyboardGestureArea as XKeyboardGestureArea } from "react-native-keyboard-controller";
import { createAnimatedComponent } from "react-native-reanimated";
import { SafeAreaView as XSafeAreaView } from "react-native-safe-area-context";

export const SafeAreaView = withUniwind(XSafeAreaView);

export const Image = withUniwind(XImage);
export const KeyboardGestureArea = withUniwind(XKeyboardGestureArea);

const AnimatedEXGlassView = createAnimatedComponent(XGlassView);

const BlurView = withUniwind(EXBlurView);

export const InnerAppleGlassView = withUniwind(BetterGlassView);
const GLASS_ENABLED = isLiquidGlassAvailable();

type FallbackAppleGlassViewProps = ComponentProps<typeof AnimatedEXGlassView> & {
  className?: string;
  fallbackTint?: ComponentProps<typeof EXBlurView>["tint"];
  fallbackIntensity?: ComponentProps<typeof EXBlurView>["intensity"];
};

const FallbackAppleGlassView = ({
  fallbackTint,
  fallbackIntensity,
  children,
  style,
  className,
  ..._rest
}: FallbackAppleGlassViewProps) => {
  return (
    <BlurView
      className={className}
      // Reanimated style props widen to animatable variants; narrow back to a
      // plain ViewStyle for the BlurView.
      // eslint-disable-next-line typescript/no-unsafe-type-assertion
      style={[{ overflow: "hidden" }, StyleSheet.flatten(style) as ViewStyle]}
      tint={fallbackTint}
      intensity={fallbackIntensity}
    >
      {/* children may be typed as SharedValue<ReactNode> via the glass props. */}
      {/* eslint-disable-next-line typescript/no-unsafe-type-assertion */}
      {children as ReactNode}
    </BlurView>
  );
};

export const AppleGlassView = GLASS_ENABLED ? InnerAppleGlassView : FallbackAppleGlassView;

function BetterGlassView(props: ComponentProps<typeof AnimatedEXGlassView>) {
  const { style, props: converted } = convertStylesToProps(props.style, {
    backgroundColor: "tintColor",
  });

  return <AnimatedEXGlassView {...{ ...props, style, ...converted }} />;
}

export const GlassView = withUniwind(XGlassView);

function convertStylesToProps(
  style: ComponentProps<typeof AnimatedEXGlassView>["style"],
  move: Record<string, string>,
) {
  if (!style) {
    return { style, props: {} as Record<string, unknown> };
  }
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  const flatStyle = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  const props: Record<string, unknown> = {};

  for (const [styleKey, propKey] of Object.entries(move)) {
    if (styleKey in flatStyle) {
      props[propKey] = flatStyle[styleKey];
      delete flatStyle[styleKey];
    }
  }

  return { style: flatStyle, props };
}
