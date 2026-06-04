import React from "react";
import { View, StyleSheet } from "react-native";

export function BlurViewRawBackdrop({
  tint: _tint = "default",
  intensity: _intensity = 50,
  ...props
}) {
  return <View style={StyleSheet.absoluteFill} {...props} />;
}
