import type { ReactNode } from "react";
import { Fragment, createElement } from "react";
// Minimal `react-native` stub for running unit tests under Node. The host
// component names keep react-test-renderer traversal simple.

type StyleObject = Record<string, unknown>;

export const View = "View";
export const Text = "Text";
export const TextInput = "TextInput";
export const Pressable = "Pressable";
export const ScrollView = "ScrollView";
export const Switch = "Switch";
export const Image = "Image";
export const ActivityIndicator = "ActivityIndicator";
export const KeyboardAvoidingView = "KeyboardAvoidingView";
export const TouchableWithoutFeedback = "TouchableWithoutFeedback";

export function FlatList<T>({
  data,
  renderItem,
  ListEmptyComponent,
  ...props
}: {
  data?: T[];
  renderItem?: (info: { item: T; index: number }) => ReactNode;
  ListEmptyComponent?: ReactNode;
}) {
  return createElement(
    "FlatList",
    props,
    data?.length
      ? data.map((item, index) =>
          createElement(Fragment, { key: index }, renderItem?.({ item, index })),
        )
      : ListEmptyComponent,
  );
}

export const StyleSheet = {
  create<T extends Record<string, StyleObject>>(styles: T): T {
    return styles;
  },
  flatten(style?: StyleObject | StyleObject[] | null): StyleObject | undefined {
    if (!style) return undefined;
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.filter(Boolean));
    }
    return style;
  },
};

export const Platform = {
  OS: "ios" as const,
  select<T>(spec: { ios?: T; android?: T; default?: T }): T | undefined {
    return spec.ios ?? spec.default;
  },
};

export const Alert = {
  alert() {},
  prompt(
    _title: string,
    _message?: string,
    buttons?: Array<{ onPress?: (value?: string) => void }>,
  ) {
    buttons?.find((button) => button.onPress)?.onPress?.("Renamed");
  },
};

export const Linking = {
  openURL: async () => undefined,
};

export const Keyboard = {
  dismiss() {},
};

export const InteractionManager = {
  createInteractionHandle: () => 1,
  clearInteractionHandle() {},
};

export function useWindowDimensions() {
  return { width: 390, height: 844, scale: 3, fontScale: 1 };
}

export function useColorScheme() {
  return "light";
}

export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
export type ImageStyle = Record<string, unknown>;
export type StyleProp<T> = T | T[] | null | undefined;
export type ColorValue = string;
export type LayoutChangeEvent = { nativeEvent: { layout: { height: number; width: number } } };
export type ViewProps = Record<string, unknown>;
export type ImageProps = Record<string, unknown>;
