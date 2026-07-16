import { Package } from "lucide-react-native";
import { useState } from "react";
import { Image, View } from "react-native";
import { Icon } from "@/components/ui/icon";

const imageSize = {
  compact: { frame: "size-10 rounded-xl", icon: "size-4" },
  default: { frame: "size-13 rounded-xl", icon: "size-6" },
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

  return (
    <View
      accessibilityLabel={showImage ? `${name} product image` : undefined}
      className={`${imageSize[size].frame} shrink-0 items-center justify-center overflow-hidden border border-border bg-muted`}
    >
      {imageUrl && showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setFailedUrl(imageUrl)}
          resizeMode="contain"
          source={{ uri: imageUrl, cache: "force-cache" }}
          className="size-full"
        />
      ) : (
        <Icon as={Package} className={`${imageSize[size].icon} text-secondary`} strokeWidth={1.8} />
      )}
    </View>
  );
}
