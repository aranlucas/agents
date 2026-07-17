import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { GroceryChatHeader } from "@/components/grocery-chat-header";
import { GroceryHeader } from "@/components/grocery-header";

const mocks = vi.hoisted(() => ({
  links: [] as string[],
  push: vi.fn(),
  replace: vi.fn(),
  startNewChat: vi.fn(),
  safeAreaStyles: [] as StyleProp<ViewStyle>[],
}));

vi.mock("@clerk/clerk-expo", () => ({
  useUser: () => ({ user: { firstName: "Taylor" } }),
}));

vi.mock("expo-router", () => ({
  Link: ({ children, href }: PropsWithChildren<{ href: string }>) => {
    mocks.links.push(href);
    return children;
  },
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/components/brand-mark", async () => {
  const React = await import("react");
  const { Text } = await import("react-native");
  return { BrandMark: () => React.createElement(Text, null, "Grocery Agent") };
});
vi.mock("@/components/grocery-agent-provider", () => ({
  useGroceryAgent: () => ({ startNewChat: mocks.startNewChat }),
}));

vi.mock("@/components/ui/avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/button", async () => {
  const React = await import("react");
  const { Pressable, Text } = await import("react-native");
  return {
    Button: ({ children, ...props }: PropsWithChildren) =>
      React.createElement(
        Pressable,
        { accessibilityRole: "button", ...props },
        typeof children === "string" ? React.createElement(Text, null, children) : children,
      ),
  };
});
vi.mock("@/components/ui/header", async () => {
  const React = await import("react");
  const { Pressable, Text, View } = await import("react-native");
  return {
    Header: ({ children }: PropsWithChildren) => React.createElement(View, null, children),
    HeaderBackButton: (props: object) =>
      React.createElement(Pressable, {
        accessibilityLabel: "Go back",
        accessibilityRole: "button",
        ...props,
      }),
    HeaderLeft: ({ children }: PropsWithChildren) => React.createElement(View, null, children),
    HeaderRight: ({ children }: PropsWithChildren) => React.createElement(View, null, children),
    HeaderTitle: ({ children }: PropsWithChildren) => React.createElement(Text, null, children),
  };
});
vi.mock("react-native-safe-area-context", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  return {
    SafeAreaView: ({
      children,
      style,
      ...props
    }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) => {
      mocks.safeAreaStyles.push(style);
      return React.createElement(View, { ...props, style }, children);
    },
  };
});

describe("GroceryHeader", () => {
  it("links the top-left brand mark to home", async () => {
    mocks.links.length = 0;
    mocks.safeAreaStyles.length = 0;

    await render(
      <GroceryHeader canGoBack={false} onBack={vi.fn()} showAccount title="Grocery Agent" />,
    );

    expect(mocks.links).toContain("/");
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(mocks.safeAreaStyles).toContainEqual({ flexGrow: 0, flexShrink: 0 });
  });

  it("matches the compact chat navigation layout", async () => {
    await render(<GroceryChatHeader canGoBack={false} onBack={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous chats" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
  });
});
