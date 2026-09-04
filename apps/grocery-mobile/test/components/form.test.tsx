import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { FormInput } from "@/components/ui/form";

type Values = { name: string };

function FormHarness({ onSubmit }: { onSubmit: (values: Values) => void }) {
  const form = useForm<Values>({ defaultValues: { name: "" }, mode: "onChange" });
  const submit = form.handleSubmit(onSubmit);

  return (
    <>
      <FormInput
        control={form.control}
        description="Name this list so everyone can find it."
        label="List name"
        name="name"
        rules={{ validate: (value) => value.trim().length > 0 || "Enter a list name." }}
      />
      <Pressable
        accessibilityLabel="Submit form"
        accessibilityRole="button"
        onPress={() => {
          void submit();
        }}
      >
        <Text>Submit</Text>
      </Pressable>
    </>
  );
}

describe("FormInput", () => {
  it("connects React Hook Form validation, errors, accessibility, and submission", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    await render(<FormHarness onSubmit={onSubmit} />);

    expect(screen.getByText("Name this list so everyone can find it.")).toBeTruthy();
    await user.press(screen.getByRole("button", { name: "Submit form" }));

    const input = screen.getByLabelText("List name");
    await screen.findByText("Enter a list name.");
    expect(input.props["aria-invalid"]).toBe(true);
    expect(input.props.accessibilityHint).toBe("Enter a list name.");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(input, "  Weekend  ");
    await waitFor(() => expect(screen.queryByText("Enter a list name.")).toBeNull());
    await user.press(screen.getByRole("button", { name: "Submit form" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: "  Weekend  " });
  });
});
