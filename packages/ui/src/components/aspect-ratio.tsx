import { cn } from "@agents/ui/lib/utils";
import type { CSSProperties } from "react";

type CSSVariableStyle = CSSProperties & Record<`--${string}`, string | number>;

function AspectRatio({
  ratio,
  className,
  ...props
}: React.ComponentProps<"div"> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={
        {
          "--ratio": ratio,
        } as CSSVariableStyle
      }
      className={cn("relative aspect-(--ratio)", className)}
      {...props}
    />
  );
}

export { AspectRatio };
