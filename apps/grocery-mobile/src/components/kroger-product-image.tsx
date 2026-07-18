import { Image, type ImageErrorEventData } from "expo-image";
import { Package } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";

const imageSize = {
  compact: { frame: "size-10 rounded-xl", icon: "size-4", image: { height: 40, width: 40 } },
  default: { frame: "size-13 rounded-xl", icon: "size-6", image: { height: 52, width: 52 } },
} as const;

export function KrogerProductImage({
  imageUrl,
  name,
  size = "default",
}: {
  imageUrl?: string;
  name: string;
  size?: keyof typeof imageSize;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const showImage = Boolean(imageUrl && imageUrl !== failedUrl);
  const handleImageError = (_event: ImageErrorEventData) => setFailedUrl(imageUrl);

  return (
    <View
      accessibilityLabel={showImage ? `${name} product image` : undefined}
      className={`${imageSize[size].frame} shrink-0 items-center justify-center overflow-hidden border border-border bg-muted`}
    >
      {imageUrl && showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          cachePolicy="memory-disk"
          contentFit="contain"
          onError={handleImageError}
          source={{ uri: imageUrl }}
          style={imageSize[size].image}
          transition={150}
        />
      ) : (
        <Icon as={Package} className={`${imageSize[size].icon} text-secondary`} strokeWidth={1.8} />
      )}
    </View>
  );
}
