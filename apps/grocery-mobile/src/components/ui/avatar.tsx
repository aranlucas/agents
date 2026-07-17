import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const avatarVariants = cva("items-center justify-center overflow-hidden rounded-full bg-muted", {
  variants: {
    size: {
      sm: "size-8",
      md: "size-10",
      lg: "size-14",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const avatarTextVariants = cva("font-medium text-muted-foreground", {
  variants: {
    size: {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-lg",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

type AvatarProps = React.ComponentPropsWithoutRef<typeof View> &
  VariantProps<typeof avatarVariants> & {
    fallback?: string;
    src?: string;
  };

function Avatar({ size, className, src, fallback, ...props }: AvatarProps) {
  const [failedSource, setFailedSource] = React.useState<string | null>(null);
  const showImage = Boolean(src) && failedSource !== src;

  return (
    <View accessibilityRole="image" className={cn(avatarVariants({ size }), className)} {...props}>
      {showImage ? (
        <Image
          source={{ uri: src }}
          className="h-full w-full"
          resizeMode="cover"
          onError={() => setFailedSource(src ?? null)}
        />
      ) : (
        <Text className={cn(avatarTextVariants({ size }))}>{fallback ?? "?"}</Text>
      )}
    </View>
  );
}

export { Avatar };
export type { AvatarProps };
