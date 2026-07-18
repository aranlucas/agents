import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { describe, expect, it, vi } from "vitest";
import { SaveResourceDialog } from "@/components/save-resource-dialog";

vi.mock("@/components/ui/animate", () => ({
  entering: { fadeIn: undefined, zoomIn: undefined },
  exiting: { fadeOut: undefined, zoomOut: undefined },
}));

const households = [
  {
    created_at: 1_753_000_000,
    created_by: "user_taylor",
    id: "household_casa",
    name: "Casa",
    role: "owner" as const,
  },
];

describe("SaveResourceDialog", () => {
  it("validates the title and submits the selected destination", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    await render(
      <SaveResourceDialog
        defaultTitle="Tomato pasta"
        households={households}
        kind="recipe"
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        saving={false}
      />,
    );

    const title = screen.getByLabelText("Recipe title");
    await user.clear(title);
    await user.press(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Add a title.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(title, "  Weeknight pasta  ");
    await user.press(screen.getByRole("button", { name: "Casa" }));
    await user.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("Weeknight pasta", "household_casa"),
    );
  });

  it("resets client-owned defaults whenever it opens", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const view = await render(
      <SaveResourceDialog
        defaultTitle="First title"
        households={households}
        kind="list"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
        saving={false}
      />,
    );

    const title = screen.getByLabelText("List title");
    await user.clear(title);
    await user.type(title, "Unsaved title");
    await user.press(screen.getByRole("button", { name: "Casa" }));

    await view.rerender(
      <SaveResourceDialog
        defaultTitle="Second title"
        households={households}
        kind="list"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open={false}
        saving={false}
      />,
    );
    await view.rerender(
      <SaveResourceDialog
        defaultTitle="Second title"
        households={households}
        kind="list"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
        open
        saving={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("List title").props.value).toBe("Second title"),
    );
    expect(screen.getByRole("button", { name: "Personal" }).props.accessibilityState).toMatchObject(
      { selected: true },
    );
    expect(screen.getByRole("button", { name: "Casa" }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });
});
