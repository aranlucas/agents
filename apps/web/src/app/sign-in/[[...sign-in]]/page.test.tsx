// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => <div data-testid="sign-in">Sign In</div>,
}));

import SignInPage from "./page";

describe("SignInPage", () => {
  it("renders the SignIn component", () => {
    render(<SignInPage />);
    expect(screen.getByTestId("sign-in")).toBeInTheDocument();
  });

  it("renders within a main landmark", () => {
    render(<SignInPage />);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
