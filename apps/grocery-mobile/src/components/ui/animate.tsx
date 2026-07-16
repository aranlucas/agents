import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";

const entering = {
  fadeIn: FadeIn.duration(200),
  fadeInDown: FadeInDown.duration(220).easing(Easing.out(Easing.cubic)),
  zoomIn: ZoomIn.duration(200).easing(Easing.out(Easing.cubic)),
};

const exiting = {
  fadeOut: FadeOut.duration(150),
  fadeOutUp: FadeOutUp.duration(200),
  zoomOut: ZoomOut.duration(200),
};

export { entering, exiting };
