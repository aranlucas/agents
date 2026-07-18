import { render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Skeleton } from "@/components/ui/skeleton";
import { TypingIndicator } from "@/components/ui/typing-indicator";

const animation = vi.hoisted(() => ({
  cancel: vi.fn(),
  reduced: false,
  repeat: vi.fn((value: unknown) => value),
}));

vi.mock("react-native-reanimated", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native-reanimated")>();
  return {
    ...original,
    cancelAnimation: animation.cancel,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => animation.reduced,
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_delay: number, value: unknown) => value,
    withRepeat: animation.repeat,
    withSequence: (...values: unknown[]) => values.at(-1),
    withTiming: (value: unknown) => value,
  };
});

describe("reduced motion", () => {
  beforeEach(() => {
    animation.cancel.mockClear();
    animation.repeat.mockClear();
    animation.reduced = false;
  });

  it("keeps skeleton and typing states static when reduced motion is enabled", async () => {
    animation.reduced = true;
    await render(
      <>
        <Skeleton accessibilityLabel="Loading list" />
        <TypingIndicator />
      </>,
    );

    await waitFor(() => expect(animation.cancel).toHaveBeenCalledTimes(4));
    expect(animation.repeat).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Typing")).toBeTruthy();
  });

  it("retains the skeleton pulse when reduced motion is disabled", async () => {
    await render(<Skeleton accessibilityLabel="Loading list" />);
    await waitFor(() => expect(animation.repeat).toHaveBeenCalledOnce());
  });
});
