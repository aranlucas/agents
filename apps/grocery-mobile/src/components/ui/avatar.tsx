import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Image, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const avatarVariants = cva("items-center justify-center rounded-full bg-muted overflow-hidden", {
  variants: {
    size: {
      sm: "h-8 w-8",
      md: "h-10 w-10",
      lg: "h-14 w-14",
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
  const [hasError, setHasError] = React.useState(false);

  return (
    <View accessibilityRole="image" className={cn(avatarVariants({ size }), className)} {...props}>
      {src && !hasError ? (
        <Image
          source={{ uri: src }}
          className="h-full w-full"
          resizeMode="cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <Text className={cn(avatarTextVariants({ size }))}>{fallback ?? "?"}</Text>
      )}
    </View>
  );
}

export { Avatar };
export type { AvatarProps };
