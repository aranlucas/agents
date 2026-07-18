import React, { useState } from "react";
import { Image } from "expo-image";
import { View, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
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

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof View>, VariantProps<typeof avatarVariants> {
  className?: string;
  src?: string;
  fallback?: string;
}

export function Avatar({ size, className, src, fallback, ...props }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = Boolean(src && src !== failedSrc);

  return (
    <View className={cn(avatarVariants({ size }), className)} {...props}>
      {src && showImage ? (
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={() => setFailedSrc(src)}
          source={{ uri: src }}
          style={{ height: "100%", width: "100%" }}
          transition={150}
        />
      ) : (
        <Text className={cn(avatarTextVariants({ size }))}>{fallback ?? "?"}</Text>
      )}
    </View>
  );
}
