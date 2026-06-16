import { render } from "@testing-library/react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cloneElement } from "react";
import { describe, expect, it, vi } from "vitest";

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
  it("renders", () => {
    expect(() => render(<ApprovalCard request={request} />)).not.toThrow();
  });
});

describe("ApprovalDialog", () => {
  it("renders", () => {
    expect(() => render(<ApprovalDialog request={request} />)).not.toThrow();
  });
});
