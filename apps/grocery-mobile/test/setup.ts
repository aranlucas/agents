import { afterEach, vi } from "vitest";
import { resetAllMocks } from "vitest-native/helpers";

vi.mock("uniwind", async (importOriginal) => ({
  ...(await importOriginal<typeof import("uniwind")>()),
  useCSSVariable: () => undefined,
}));

process.env.EXPO_OS = "android";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  resetAllMocks();
});
