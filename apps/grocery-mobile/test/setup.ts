import { afterEach } from "vitest";
import { resetAllMocks } from "vitest-native/helpers";

process.env.EXPO_OS = "android";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  resetAllMocks();
});
