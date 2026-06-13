import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

vi.mock("@clerk/nextjs", () => ({
  SignUp: () => <div data-sign-up />,
}));

import SignUpPage from "./page";

describe("SignUpPage", () => {
  it("renders", async () => {
    await renderSmoke("sign-up", <SignUpPage />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("sign-up", <SignUpPage />);
  });
});
