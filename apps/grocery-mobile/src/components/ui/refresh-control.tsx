import * as React from "react";
import { RefreshControl as NativeRefreshControl } from "react-native";
import { useResolveClassNames } from "uniwind";

type RefreshControlProps = React.ComponentProps<typeof NativeRefreshControl>;

function RefreshControl({ colors, tintColor, ...props }: RefreshControlProps) {
  const primary = useResolveClassNames("text-primary").color;
  const tint = tintColor ?? primary;

  return (
    <NativeRefreshControl
      colors={colors ?? (tint ? [tint] : undefined)}
      tintColor={tint}
      {...props}
    />
  );
}

export { RefreshControl };
export type { RefreshControlProps };
