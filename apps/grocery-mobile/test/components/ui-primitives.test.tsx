import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { describe, expect, it, vi } from "vitest";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";

vi.mock("expo-image", async () => {
  const React = await import("react");
  const { Pressable } = await import("react-native");
  return {
    Image: ({ onError, source }: { onError?: () => void; source?: { uri?: string } }) =>
      React.createElement(Pressable, {
        accessibilityLabel: "Avatar image",
        onPress: onError,
        testID: `avatar-image-${source?.uri ?? "unknown"}`,
      }),
  };
});

vi.mock("@rn-primitives/checkbox", async () => {
  const React = await import("react");
  const { Pressable, View } = await import("react-native");
  return {
    Root: ({ checked, children, onCheckedChange, ...props }: Record<string, any>) =>
      React.createElement(
        Pressable,
        {
          ...props,
          accessibilityRole: "checkbox",
          accessibilityState: { checked, disabled: Boolean(props.disabled) },
          onPress: () => onCheckedChange(!checked),
        },
        children,
      ),
    Indicator: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

vi.mock("lucide-react-native", () => ({
  Check: () => null,
  X: () => null,
}));

vi.mock("@/components/ui/animate", () => ({
  entering: { fadeIn: undefined, zoomIn: undefined },
  exiting: { fadeOut: undefined, zoomOut: undefined },
}));

describe("shared UI primitive behavior", () => {
  it("uses the checkbox root as the only press and accessibility target", async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    await render(
      <Checkbox
        accessibilityLabel="Select milk"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await user.press(screen.getByRole("checkbox", { name: "Select milk" }));
    expect(onCheckedChange).toHaveBeenCalledOnce();
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("keeps caller-supplied radio semantics and checked state on chips", async () => {
    await render(
      <Chip accessibilityRole="radio" accessibilityState={{ checked: true }} selected>
        Weekly
      </Chip>,
    );

    const chip = screen.getByRole("radio", { name: "Weekly" });
    expect(chip.props.accessibilityState).toMatchObject({ checked: true });
  });

  it("recovers from an avatar image failure when the source changes", async () => {
    const view = await render(<Avatar fallback="LA" src="https://example.test/broken.png" />);
    await fireEvent.press(screen.getByTestId("avatar-image-https://example.test/broken.png"));
    expect(screen.getByText("LA")).toBeTruthy();

    await view.rerender(<Avatar fallback="LA" src="https://example.test/profile.png" />);
    expect(screen.getByTestId("avatar-image-https://example.test/profile.png")).toBeTruthy();
  });

  it("preserves a loading button's accessible name", async () => {
    await render(<Button loading>Save changes</Button>);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("dismisses an alert dialog through Android hardware Back", async () => {
    const onOpenChange = vi.fn();
    const view = await render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm cart</AlertDialogTitle>
          <AlertDialogDescription>Review this action.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const modal = view.container.queryAll(
      (node) => typeof node.props.onRequestClose === "function",
    )[0];
    expect(modal).toBeDefined();
    fireEvent(modal!, "requestClose");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      view.container.queryAll((node) => node.props.accessibilityViewIsModal === true),
    ).toHaveLength(1);
    expect(
      view.container.queryAll((node) => node.props.accessibilityRole === "alert"),
    ).toHaveLength(1);
  });
});
