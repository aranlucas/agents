import { Image } from "react-native";

export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <Image
      accessibilityLabel="Grocery Agent"
      resizeMode="contain"
      source={require("../../assets/splash-icon.png")}
      style={{ width: size, height: size }}
    />
  );
}
