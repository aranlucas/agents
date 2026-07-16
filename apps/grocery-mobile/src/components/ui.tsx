import type { ReactNode } from "react";
import type { PressableProps, StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, shadows } from "@/lib/theme";

export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <Image
      accessibilityLabel="Grocery Agent"
      resizeMode="contain"
      source={require("../../assets/splash-icon.png")}
      style={{ width: size, height: size }}
    />
  );
}

export function PrimaryButton({
  children,
  loading,
  style,
  ...props
}: PressableProps & { children: ReactNode; loading?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled || loading}
      {...props}
      style={({ pressed }) => [
        styles.primary,
        pressed && styles.primaryPressed,
        (props.disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : typeof children === "string" || typeof children === "number" ? (
        <Text style={styles.primaryText}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  children,
  style,
  ...props
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed, style]}
    >
      <Text style={styles.secondaryText}>{children}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function InlineError({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Text selectable style={styles.errorText}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  primaryPressed: { backgroundColor: colors.greenPressed },
  primaryText: { color: colors.white, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  secondary: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryPressed: { opacity: 0.72 },
  secondaryText: { color: colors.forest, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.line,
    boxShadow: shadows.card,
  },
  error: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
