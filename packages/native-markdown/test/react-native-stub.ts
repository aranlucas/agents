type StyleObject = Record<string, unknown>;

export const ScrollView = "ScrollView";
export const View = "View";

export const PixelRatio = {
  getFontScale: () => 1,
};

export const StyleSheet = {
  flatten(style?: StyleObject | StyleObject[] | null): StyleObject | undefined {
    if (!style) return undefined;
    if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean));
    return style;
  },
};
