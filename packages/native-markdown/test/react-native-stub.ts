type StyleObject = Record<string, unknown>;

export const ScrollView = "ScrollView";
export const Text = "Text";
export const View = "View";

export const Platform = {
  OS: "ios",
  select<T>(specifics: { default?: T; ios?: T }): T | undefined {
    return specifics.ios ?? specifics.default;
  },
};

class AnimatedValue {
  constructor(public value: number) {}
}

const animation = { start: () => undefined, stop: () => undefined };

export const Animated = {
  Text: "Animated.Text",
  Value: AnimatedValue,
  loop: () => animation,
  sequence: () => animation,
  timing: () => animation,
};

export const PixelRatio = {
  getFontScale: () => 1,
};

export const StyleSheet = {
  flatten(style?: StyleObject | StyleObject[] | null): StyleObject | undefined {
    if (!style) return undefined;
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.map((value) => StyleSheet.flatten(value)).filter(Boolean));
    }
    return style;
  },
};
