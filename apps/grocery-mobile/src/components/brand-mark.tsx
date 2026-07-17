import { Image } from "react-native";

const sizeClassName = {
  sm: "size-9",
  md: "size-11",
  lg: "size-13",
  xl: "size-15",
} as const;

export function BrandMark({ size = "md" }: { size?: keyof typeof sizeClassName }) {
  return (
    <Image
      accessibilityLabel="Grocery Agent"
      className={sizeClassName[size]}
      resizeMode="contain"
      source={require("../../assets/splash-icon.png")}
    />
  );
}
