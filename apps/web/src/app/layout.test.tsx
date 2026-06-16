import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Schibsted_Grotesk: () => ({ variable: "font-sans" }),
  JetBrains_Mono: () => ({ variable: "font-mono" }),
}));

vi.mock("@agents/ui/globals.css", () => ({}));
vi.mock("./globals.css", () => ({}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: vi.fn() }),
}));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("renders children inside html and body", () => {
    const markup = renderToStaticMarkup(<RootLayout>hello world</RootLayout>);
    expect(markup).toContain("<html");
    expect(markup).toContain("hello world");
  });

  it("renders without throwing", () => {
    expect(() => render(<RootLayout>test</RootLayout>)).not.toThrow();
  });
});
