import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderSmoke } from "@/test/test-utils";

vi.mock("next/font/google", () => ({
  Schibsted_Grotesk: () => ({ variable: "font-sans" }),
  JetBrains_Mono: () => ({ variable: "font-mono" }),
}));

vi.mock("./globals.css", () => ({}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("renders children inside html and body", async () => {
    const markup = renderToStaticMarkup(<RootLayout>hello world</RootLayout>);
    expect(markup).toContain("<html");
    expect(markup).toContain("hello world");
  });

  it("interacts without throwing", async () => {
    await renderSmoke("layout", <RootLayout>test</RootLayout>);
  });
});
