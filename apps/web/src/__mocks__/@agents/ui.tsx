import type { ComponentProps } from "react";
import { vi } from "vitest";

// Shared stubs for @agents/ui used across DOM test files.
// Tests that need to assert on specific calls can use vi.mocked():
//   vi.mocked(usePromptInputController).mock.results[0].value.textInput.setInput

export const SidebarTrigger = () => null;

export const cn = (...classes: unknown[]) => classes.filter(Boolean).join(" ");

export const Button = ({ children, ...props }: ComponentProps<"button">) => (
  <button type="button" {...props}>
    {children}
  </button>
);

export const Tool = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
export const ToolHeader = () => null;
export const ToolContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

export const PromptInputButton = ({
  children,
  tooltip,
  ...props
}: ComponentProps<"button"> & { tooltip?: string }) => (
  <button title={tooltip} type="button" {...props}>
    {children}
  </button>
);

export const usePromptInputController = vi.fn().mockReturnValue({
  textInput: { value: "", setInput: vi.fn(), clear: vi.fn() },
});
