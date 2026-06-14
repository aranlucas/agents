import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cloneElement } from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

const dialogPrimitive = vi.hoisted(() => ({
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Backdrop: (props: ComponentProps<"div">) => <div {...props} />,
  Popup: (props: ComponentProps<"div">) => <div {...props} />,
  Title: (props: ComponentProps<"h2">) => <h2 {...props} />,
  Description: (props: ComponentProps<"p">) => <p {...props} />,
  Close: ({ children, render, ...props }: ComponentProps<"button"> & { render?: ReactElement }) =>
    render ? cloneElement(render, props, children) : <button {...props}>{children}</button>,
}));

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: dialogPrimitive,
}));

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@agents/ui/components/dialog";

describe("Dialog components", () => {
  it("renders with all subcomponents", async () => {
    await renderSmoke(
      "dialog-components",
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>Footer</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
  });

  it("interacts without throwing", async () => {
    await interactSmoke(
      "dialog-components",
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <DialogFooter>Footer</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
  });
});
