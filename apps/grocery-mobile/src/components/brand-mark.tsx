import { Image } from "expo-image";

const imageSize = {
  sm: 36,
  md: 44,
  lg: 52,
  xl: 60,
} as const;

export function BrandMark({ size = "md" }: { size?: keyof typeof imageSize }) {
  const dimension = imageSize[size];
  return (
    <Image
      accessibilityLabel="Grocery Agent"
      contentFit="contain"
      source={require("../../assets/splash-icon.png")}
      style={{ height: dimension, width: dimension }}
    />
  );
}
