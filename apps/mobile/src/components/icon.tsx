import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { withUniwind } from "uniwind";
import type { LucideIcon } from "lucide-react-native";

function IconBase({
  icon: Icon,
  style,
  strokeWidth,
}: {
  icon: LucideIcon;
  style?: StyleProp<TextStyle>;
  strokeWidth?: number;
  className?: string;
}) {
  const flat = StyleSheet.flatten(style);
  const width = typeof flat?.width === "number" ? flat.width : undefined;
  const height = typeof flat?.height === "number" ? flat.height : undefined;
  const size = width ?? height ?? 24;
  const color = typeof flat?.color === "string" ? flat.color : "currentColor";
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

export const Icon = withUniwind(IconBase);
