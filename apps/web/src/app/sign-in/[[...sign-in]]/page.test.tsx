import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => <div data-sign-in />,
}));

import SignInPage from "./page";

describe("SignInPage", () => {
  it("renders", () => {
    expect(() => render(<SignInPage />)).not.toThrow();
  });
});
