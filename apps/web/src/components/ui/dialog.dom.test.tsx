// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

// vi.mock is hoisted to the top of the module by vitest — no top-level
// variables can be referenced in the factory. Inline everything.
vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Backdrop: (props: React.ComponentProps<"div">) => <div {...props} />,
    Popup: (props: React.ComponentProps<"div">) => <div {...props} />,
    Title: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
    Description: (props: React.ComponentProps<"p">) => <p {...props} />,
    Close: ({
      children,
      render: renderProp,
      ...props
    }: React.ComponentProps<"button"> & { render?: React.ReactElement }) =>
      renderProp
        ? React.cloneElement(renderProp, props, children)
        : <button {...props}>{children}</button>,
  },
}));

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@agents/ui/components/dialog";

describe("Dialog composition", () => {
  it("renders title, description, and children", () => {
    render(
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm action</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>OK</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("Confirm action")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
  });

  it("renders a close button inside DialogContent by default", () => {
    render(
      <Dialog open>
        <DialogContent>Content</DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("omits the close button when showCloseButton={false}", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>Content</DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a Close button inside DialogFooter when showCloseButton is set", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogFooter showCloseButton>Submit</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("does not render a footer close button by default", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogFooter>Submit</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });
});
