import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

vi.mock("@clerk/nextjs", () => ({
  SignIn: () => <div data-sign-in />,
}));

import SignInPage from "./page";

describe("SignInPage", () => {
  it("renders", async () => {
    await renderSmoke("sign-in", <SignInPage />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("sign-in", <SignInPage />);
  });
});
