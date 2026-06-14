// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";

// Provide a minimal @base-ui/react/dialog mock so the component renders in jsdom
vi.mock("@base-ui/react/dialog", () => {
  const Root = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const Trigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const Portal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const Backdrop = (props: React.ComponentProps<"div">) => <div {...props} />;
  const Popup = (props: React.ComponentProps<"div">) => <div {...props} />;
  const Title = (props: React.ComponentProps<"h2">) => <h2 {...props} />;
  const Description = (props: React.ComponentProps<"p">) => <p {...props} />;
  const Close = ({
    children,
    render: renderProp,
    ...props
  }: React.ComponentProps<"button"> & { render?: React.ReactElement }) =>
    renderProp ? (
      React.cloneElement(renderProp, props, children)
    ) : (
      <button {...props}>{children}</button>
    );
  return { Dialog: { Root, Trigger, Portal, Backdrop, Popup, Title, Description, Close } };
});

import { ApprovalCard, ApprovalDialog } from "./approval-dialog";

describe("ApprovalCard", () => {
  it("renders the proposed action", () => {
    render(
      <ApprovalCard
        request={{ id: "1", action: "Book flight", reason: "Hold expires", resolve: vi.fn() }}
      />,
    );
    expect(screen.getByText("Book flight")).toBeInTheDocument();
  });

  it("renders the reason when provided", () => {
    render(
      <ApprovalCard
        request={{ id: "1", action: "Book", reason: "Hold expires soon", resolve: vi.fn() }}
      />,
    );
    expect(screen.getByText("Hold expires soon")).toBeInTheDocument();
  });

  it("hides the reason section when reason is empty", () => {
    render(<ApprovalCard request={{ id: "1", action: "Book", reason: "", resolve: vi.fn() }} />);
    expect(screen.queryByText(/Why/i)).not.toBeInTheDocument();
  });

  it("calls resolve({ approved: true }) when Approve is clicked", async () => {
    const resolve = vi.fn();
    render(<ApprovalCard request={{ id: "1", action: "Book", reason: "", resolve }} />);
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith({ approved: true });
  });

  it("calls resolve({ approved: false }) when Reject is clicked", async () => {
    const resolve = vi.fn();
    render(<ApprovalCard request={{ id: "1", action: "Book", reason: "", resolve }} />);
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith({ approved: false, note: "rejected by user" });
  });
});

describe("ApprovalDialog", () => {
  it("renders the proposed action", () => {
    render(
      <ApprovalDialog
        request={{ id: "2", action: "Reserve hotel", reason: "Deadline", resolve: vi.fn() }}
      />,
    );
    expect(screen.getByText("Reserve hotel")).toBeInTheDocument();
  });

  it("renders the reason when provided", () => {
    render(
      <ApprovalDialog
        request={{ id: "2", action: "Reserve", reason: "Price expires", resolve: vi.fn() }}
      />,
    );
    expect(screen.getByText("Price expires")).toBeInTheDocument();
  });

  it("hides the reason section when reason is empty", () => {
    render(
      <ApprovalDialog request={{ id: "2", action: "Reserve", reason: "", resolve: vi.fn() }} />,
    );
    // The "Why" label is inside the reason block; it must not appear when reason is blank
    expect(screen.queryByText(/^Why$/i)).not.toBeInTheDocument();
  });

  it("calls resolve({ approved: true }) when Approve is clicked", async () => {
    const resolve = vi.fn();
    render(<ApprovalDialog request={{ id: "2", action: "Reserve", reason: "", resolve }} />);
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(resolve).toHaveBeenCalledWith({ approved: true });
  });

  it("calls resolve({ approved: false }) when Reject is clicked", async () => {
    const resolve = vi.fn();
    render(<ApprovalDialog request={{ id: "2", action: "Reserve", reason: "", resolve }} />);
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(resolve).toHaveBeenCalledWith({ approved: false, note: "rejected by user" });
  });
});
