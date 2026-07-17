import { render } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { homeLinks, stackScreens } = vi.hoisted(() => ({
  homeLinks: [] as string[],
  stackScreens: [] as string[],
}));

vi.mock("@clerk/clerk-expo", () => ({
  ClerkLoaded: ({ children }: PropsWithChildren) => children,
  ClerkLoading: () => null,
  ClerkProvider: ({ children }: PropsWithChildren) => children,
  SignedIn: ({ children }: PropsWithChildren) => children,
  SignedOut: () => null,
  useUser: () => ({ user: { firstName: "Taylor" } }),
}));

vi.mock("@clerk/clerk-expo/resource-cache", () => ({ resourceCache: {} }));
vi.mock("@clerk/clerk-expo/token-cache", () => ({ tokenCache: {} }));

vi.mock("@copilotkit/react-native", () => ({
  CopilotKitProvider: ({ children }: PropsWithChildren) => children,
}));

vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: ({ children }: PropsWithChildren) => children,
}));

vi.mock("@rn-primitives/portal", () => ({ PortalHost: () => null }));

vi.mock("expo-router", () => {
  function Link({ children, href }: PropsWithChildren<{ href: string }>) {
    homeLinks.push(href);
    return children;
  }

  function Screen({ name }: { name: string }) {
    stackScreens.push(name);
    return null;
  }

  function Stack({ children }: PropsWithChildren) {
    return children;
  }
  Stack.Screen = Screen;

  return { Link, Stack };
});

vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));

vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: PropsWithChildren) => children,
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: PropsWithChildren) => children,
}));

vi.mock("uniwind", () => ({
  useResolveClassNames: () => ({ backgroundColor: "#ffffff" }),
  withUniwind: <T,>(component: T) => component,
}));

vi.mock("@/components/configuration-error", () => ({ ConfigurationError: () => null }));
vi.mock("@/components/grocery-chat", () => ({ GroceryChat: () => null }));
vi.mock("@/components/grocery-copilot-session", () => ({
  GroceryCopilotSession: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/components/grocery-header", () => ({ GroceryHeader: () => null }));
vi.mock("@/components/query-provider", () => ({
  QueryProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/components/sign-in-screen", () => ({ SignInScreen: () => null }));
vi.mock("@/components/ui/button", async () => {
  const React = await import("react");
  const { Text } = await import("react-native");
  return {
    Button: ({ children }: PropsWithChildren) => React.createElement(Text, null, children),
  };
});
vi.mock("@/components/ui/card", async () => {
  const React = await import("react");
  const { Text, View } = await import("react-native");
  const Container = ({ children }: PropsWithChildren) => React.createElement(View, null, children);
  const Label = ({ children }: PropsWithChildren) => React.createElement(Text, null, children);
  return {
    Card: Container,
    CardContent: Container,
    CardDescription: Label,
    CardFooter: Container,
    CardHeader: Container,
    CardTitle: Label,
  };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/ui/text", async () => {
  const { default: Text } = await vi.importActual<{
    default: React.ComponentType<PropsWithChildren>;
  }>("react-native/Libraries/Text/Text");
  return { Text };
});
vi.mock("@/components/grocery-agent-provider", () => ({
  useGroceryAgent: () => ({ state: { cart: [], shopping_list: [] } }),
}));

vi.mock("@/shims/node-crypto", () => ({}));

vi.mock("@/lib/config", () => ({
  getClerkPublishableKey: () => "pk_test_navigation",
  getRuntimeUrl: () => "https://runtime.example.test",
}));

import RootLayout from "@/app/_layout";
import GroceryChatScreen from "@/app/chat";
import GroceryHomeScreen from "@/app/index";
import { GroceryChat } from "@/components/grocery-chat";

describe("grocery navigation", () => {
  beforeEach(() => {
    homeLinks.length = 0;
    stackScreens.length = 0;
  });

  it("registers the dashboard and chat routes", async () => {
    await render(<RootLayout />);

    expect(stackScreens).toContain("index");
    expect(stackScreens).toContain("chat");
  });

  it("links the dashboard to the chat route", async () => {
    await render(<GroceryHomeScreen />);

    expect(homeLinks).toContain("/chat");
  });

  it("renders GroceryChat at the chat route", async () => {
    await render(<GroceryChatScreen />);
    const chatRoute = GroceryChatScreen();

    expect(chatRoute.type).toBe(GroceryChat);
  });
});
