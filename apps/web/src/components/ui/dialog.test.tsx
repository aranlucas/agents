import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

const dialogPrimitive = vi.hoisted(() => ({
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Backdrop: (props: React.ComponentProps<"div">) => <div {...props} />,
  Popup: (props: React.ComponentProps<"div">) => <div {...props} />,
  Title: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
  Description: (props: React.ComponentProps<"p">) => <p {...props} />,
  Close: ({ children, render, ...props }: React.ComponentProps<"button"> & { render?: React.ReactElement }) =>
    render ? React.cloneElement(render, props, children) : <button {...props}>{children}</button>,
}));

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: dialogPrimitive,
}));

import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@agents/ui/components/dialog";

describe("Dialog components", () => {
  it("renders with all subcomponents", async () => {
    await renderSmoke("dialog-components", (
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>Footer</DialogFooter>
        </DialogContent>
      </Dialog>
    ));
  });

  it("interacts without throwing", async () => {
    await interactSmoke("dialog-components", (
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <DialogFooter>Footer</DialogFooter>
        </DialogContent>
      </Dialog>
    ));
  });
});
