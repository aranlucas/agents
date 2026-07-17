import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export async function renderWithQueryClient(ui: ReactElement, client = createTestQueryClient()) {
  const renderResult = await render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { client, ...renderResult };
}
