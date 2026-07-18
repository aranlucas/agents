import { fireEvent, render, screen } from "@testing-library/react-native";
import { Fragment } from "react";
import type { PropsWithChildren, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  homeLinks,
  push,
  replace,
  screenOptionCalls,
  stackOptions,
  stackScreenOptions,
  stackScreens,
  startNewChat,
} = vi.hoisted(() => ({
  homeLinks: [] as string[],
  push: vi.fn(),
  replace: vi.fn(),
  screenOptionCalls: [] as Record<string, unknown>[],
  stackOptions: [] as Record<string, unknown>[],
  stackScreenOptions: {} as Record<string, Record<string, unknown>>,
  stackScreens: [] as string[],
  startNewChat: vi.fn(),
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

vi.mock("expo-router", async () => {
  const React = await import("react");
  const { Pressable } = await import("react-native");

  function Link({ children, href }: PropsWithChildren<{ href: string }>) {
    homeLinks.push(href);
    return children;
  }

  function Screen({ name, options }: { name?: string; options?: Record<string, unknown> }) {
    screenOptionCalls.push(options ?? {});
    if (name) {
      stackScreens.push(name);
      stackScreenOptions[name] = options ?? {};
    }
    return null;
  }

  function Stack({
    children,
    screenOptions,
  }: PropsWithChildren<{ screenOptions?: Record<string, unknown> }>) {
    stackOptions.push(screenOptions ?? {});
    return children;
  }
  Stack.Screen = Screen;

  function Toolbar({ children }: PropsWithChildren<{ placement?: string }>) {
    return children;
  }
  Toolbar.Button = ({
    accessibilityLabel,
    onPress,
  }: {
    accessibilityLabel: string;
    onPress: () => void;
  }) =>
    React.createElement(Pressable, {
      accessibilityLabel,
      accessibilityRole: "button",
      onPress,
    });
  Stack.Toolbar = Toolbar;

  return {
    DarkTheme: { dark: true, colors: {} },
    DefaultTheme: { dark: false, colors: {} },
    Link,
    Stack,
    ThemeProvider: ({ children }: PropsWithChildren) => children,
    useRouter: () => ({ push, replace }),
  };
});

vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));

vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: PropsWithChildren) => children,
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: PropsWithChildren) => children,
}));

vi.mock("uniwind", () => ({
  useCSSVariable: () => undefined,
  useResolveClassNames: () => ({ backgroundColor: "#ffffff" }),
  useUniwind: () => ({ hasAdaptiveThemes: true, theme: "light" }),
  withUniwind: <T,>(component: T) => component,
}));

vi.mock("@/components/configuration-error", () => ({ ConfigurationError: () => null }));
vi.mock("@/components/grocery-chat", () => ({ GroceryChat: vi.fn(() => null) }));
vi.mock("@/components/grocery-copilot-session", () => ({
  GroceryCopilotSession: ({ children }: PropsWithChildren) => children,
}));
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
  useGroceryAgent: () => ({
    startNewChat,
    state: { cart: [], shopping_list: [] },
  }),
}));
vi.mock("@/hooks/use-grocery-agent", () => ({
  useGroceryState: () => ({ cart: [], shopping_list: [] }),
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
    screenOptionCalls.length = 0;
    stackOptions.length = 0;
    for (const name of Object.keys(stackScreenOptions)) delete stackScreenOptions[name];
    stackScreens.length = 0;
    push.mockReset();
    replace.mockReset();
    startNewChat.mockReset();
  });

  it("registers the dashboard and chat routes", async () => {
    await render(<RootLayout />);

    expect(stackScreens).toContain("index");
    expect(stackScreens).toContain("chat");
  });

  it("uses native stack chrome without custom headers", async () => {
    await render(<RootLayout />);

    expect(stackOptions[0]).toMatchObject({
      headerBackButtonDisplayMode: "minimal",
      headerTitleAlign: "center",
    });
    expect(stackOptions[0]).not.toHaveProperty("header");
    expect(stackScreenOptions.index).not.toHaveProperty("headerLeft");
    expect(stackScreenOptions.index).not.toHaveProperty("headerRight");
    expect(stackScreenOptions.chat).not.toHaveProperty("headerRight");
    expect(stackScreenOptions.chat).not.toHaveProperty("header");
  });

  it("links the dashboard to the chat route", async () => {
    await render(<GroceryHomeScreen />);

    expect(homeLinks).toContain("/chat");
  });

  it("uses native toolbar buttons for dashboard actions", async () => {
    await render(<GroceryHomeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Home" }));
    await fireEvent.press(screen.getByRole("button", { name: "Account" }));

    expect(replace).toHaveBeenCalledWith("/");
    expect(push).toHaveBeenCalledWith("/account");
  });

  it("falls back to header action buttons for dashboard actions on web", async () => {
    process.env.EXPO_OS = "web";
    try {
      await render(<GroceryHomeScreen />);

      const options = screenOptionCalls.at(-1) as {
        headerLeft: () => ReactElement;
        headerRight: () => ReactElement;
      };
      await render(
        <Fragment>
          {options.headerLeft()}
          {options.headerRight()}
        </Fragment>,
      );

      await fireEvent.press(screen.getByRole("button", { name: "Home" }));
      await fireEvent.press(screen.getByRole("button", { name: "Account" }));

      expect(replace).toHaveBeenCalledWith("/");
      expect(push).toHaveBeenCalledWith("/account");
    } finally {
      process.env.EXPO_OS = "android";
    }
  });

  it("renders GroceryChat at the chat route", async () => {
    await render(<GroceryChatScreen />);

    expect(GroceryChat).toHaveBeenCalled();
  });

  it("uses native toolbar buttons for chat actions", async () => {
    await render(<GroceryChatScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Previous chats" }));
    await fireEvent.press(screen.getByRole("button", { name: "New chat" }));
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));

    expect(push).toHaveBeenNthCalledWith(1, "/chat-history");
    expect(startNewChat).toHaveBeenCalledOnce();
    expect(push).toHaveBeenNthCalledWith(2, "/account");
  });

  it("falls back to header action buttons for chat actions on web", async () => {
    process.env.EXPO_OS = "web";
    try {
      await render(<GroceryChatScreen />);

      const options = screenOptionCalls.at(-1) as { headerRight: () => ReactElement };
      await render(options.headerRight());

      await fireEvent.press(screen.getByRole("button", { name: "Previous chats" }));
      await fireEvent.press(screen.getByRole("button", { name: "New chat" }));
      await fireEvent.press(screen.getByRole("button", { name: "Settings" }));

      expect(push).toHaveBeenNthCalledWith(1, "/chat-history");
      expect(startNewChat).toHaveBeenCalledOnce();
      expect(push).toHaveBeenNthCalledWith(2, "/account");
    } finally {
      process.env.EXPO_OS = "android";
    }
  });
});
