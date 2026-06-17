// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  SignUp: () => <div data-testid="sign-up">Sign Up</div>,
}));

import SignUpPage from "./page";

describe("SignUpPage", () => {
  it("renders the SignUp component", () => {
    render(<SignUpPage />);
    expect(screen.getByTestId("sign-up")).toBeInTheDocument();
  });

  it("renders within a main landmark", () => {
    render(<SignUpPage />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
