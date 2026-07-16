import { Package } from "lucide-react-native";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";

export function KrogerProductImage({
  imageUrl,
  name,
  size = 52,
}: {
  imageUrl?: string;
  name: string;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const showImage = Boolean(imageUrl && imageUrl !== failedUrl);

  return (
    <View
      accessibilityLabel={showImage ? `${name} product image` : undefined}
      style={[styles.frame, { width: size, height: size, borderRadius: Math.round(size * 0.22) }]}
    >
      {imageUrl && showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setFailedUrl(imageUrl)}
          resizeMode="contain"
          source={{ uri: imageUrl, cache: "force-cache" }}
          style={styles.image}
        />
      ) : (
        <Package color={colors.forest} size={Math.round(size * 0.44)} strokeWidth={1.8} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  image: { width: "100%", height: "100%" },
});
