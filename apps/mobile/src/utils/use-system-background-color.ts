import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { useCSSVariable } from "uniwind";

export function useSystemBackgroundColor() {
  const color = useCSSVariable("--app-background");
  useEffect(() => {
    if (typeof color === "string") {
      void SystemUI.setBackgroundColorAsync(color);
    }
  }, [color]);
}
