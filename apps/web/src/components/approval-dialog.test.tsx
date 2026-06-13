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


import { ApprovalCard, ApprovalDialog } from "./approval-dialog";
import type { ApprovalRequest } from "./approval-dialog";

const resolve = vi.fn();

const request: ApprovalRequest = {
  id: "1",
  action: "Book flight",
  reason: "Fare hold",
  resolve,
};

describe("ApprovalCard", () => {
  it("renders", async () => {
    await renderSmoke("approval-card", <ApprovalCard request={request} />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("approval-card", <ApprovalCard request={request} />);
  });
});

describe("ApprovalDialog", () => {
  it("renders", async () => {
    await renderSmoke("approval-dialog", <ApprovalDialog request={request} />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("approval-dialog", <ApprovalDialog request={{ ...request, reason: "" }} />);
  });
});
