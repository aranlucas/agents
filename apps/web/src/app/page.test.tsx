import type { ReactNode } from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/providers", () => ({
  Providers: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useUser: () => ({
    isLoaded: true,
    user: null,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useQuery: () => ({ data: null, isLoading: false, error: null }),
}));

import Home from "./page";

describe("Home page", () => {
  it("renders", async () => {
    await renderSmoke("home", <Home />);
  });

  it("interacts without throwing", async () => {
    await interactSmoke("home", <Home />);
  });
});
