import React from "react";
import { RefreshControl as RNRefreshControl } from "react-native";
import { useThemeColor } from "@/hooks/use-theme-color";

export interface RefreshControlProps extends React.ComponentPropsWithoutRef<
  typeof RNRefreshControl
> {
  refreshing: boolean;
  onRefresh: () => void;
  tintColor?: string;
  colors?: string[];
}

export function RefreshControl({
  refreshing,
  onRefresh,
  tintColor,
  colors,
  ...props
}: RefreshControlProps) {
  const primary = useThemeColor("--color-primary", "#15803d");
  const tint = tintColor ?? primary;

  return (
    <RNRefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={tint}
      colors={colors ?? [tint]}
      {...props}
    />
  );
}
