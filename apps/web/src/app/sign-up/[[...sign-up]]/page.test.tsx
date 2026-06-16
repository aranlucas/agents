import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  SignUp: () => <div data-sign-up />,
}));

import SignUpPage from "./page";

describe("SignUpPage", () => {
  it("renders", () => {
    expect(() => render(<SignUpPage />)).not.toThrow();
  });
});
