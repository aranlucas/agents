// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import ResumePage from "./page";

describe("Resume page", () => {
  it("renders the candidate name and title", () => {
    render(<ResumePage />);

    expect(screen.getByRole("heading", { name: "Lucas Arango" })).toBeInTheDocument();
    expect(screen.getAllByText(/Senior Software Engineer/i).length).toBeGreaterThan(0);
  });

  it("lists DoorDash experience with Ask DoorDash", () => {
    render(<ResumePage />);

    expect(screen.getByRole("heading", { name: "Experience" })).toBeInTheDocument();
    expect(screen.getAllByText(/Ask DoorDash/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Oct 2023 – Present/)).toBeInTheDocument();
  });

  it("links to the interactive Resume agent", () => {
    render(<ResumePage />);

    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toContain("/console/resume");
  });

  it("shows skills and education in the sidebar", () => {
    render(<ResumePage />);

    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Education" })).toBeInTheDocument();
    expect(screen.getByText(/University of Florida/)).toBeInTheDocument();
  });
});
