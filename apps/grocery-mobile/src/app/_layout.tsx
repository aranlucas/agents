import "@/shims/node-crypto";
import "@/global.css";
import { ClerkLoaded, ClerkLoading, ClerkProvider, SignedIn, SignedOut } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useUniwind, withUniwind } from "uniwind";
import { ConfigurationError } from "@/components/configuration-error";
import { GroceryCopilotSession } from "@/components/grocery-copilot-session";
import { QueryProvider } from "@/components/query-provider";
import { SignInScreen } from "@/components/sign-in-screen";
import { Spinner } from "@/components/ui/spinner";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getClerkPublishableKey, getRuntimeUrl } from "@/lib/config";
import { Sentry } from "@/lib/sentry";

const UniwindGestureHandlerRootView = withUniwind(GestureHandlerRootView);

function configuration(): { clerkKey: string; runtimeUrl: string } | Error {
  try {
    return { clerkKey: getClerkPublishableKey(), runtimeUrl: getRuntimeUrl() };
  } catch (error) {
    return error instanceof Error ? error : new Error("This build is missing required settings.");
  }
}

function RootLayout() {
  const configured = configuration();
  const { theme } = useUniwind();
  const background = useThemeColor("--color-background", "#f7f8f2");
  const border = useThemeColor("--color-border", "#dfe5dc");
  const card = useThemeColor("--color-card", "#ffffff");
  const destructive = useThemeColor("--color-destructive", "#b42318");
  const foreground = useThemeColor("--color-foreground", "#17201a");
  const primary = useThemeColor("--color-primary", "#15803d");
  const navigationTheme = useMemo(() => {
    const base = theme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background,
        border,
        card,
        notification: destructive,
        primary,
        text: foreground,
      },
    };
  }, [background, border, card, destructive, foreground, primary, theme]);

  return (
    <UniwindGestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <KeyboardProvider>
          <BottomSheetModalProvider>
            <StatusBar style="auto" />
            {configured instanceof Error ? (
              <ConfigurationError message={configured.message} />
            ) : (
              <ClerkProvider
                publishableKey={configured.clerkKey}
                tokenCache={tokenCache}
                __experimental_resourceCache={resourceCache}
              >
                <QueryProvider>
                  <ClerkLoading>
                    <View className="flex-1 items-center justify-center bg-background">
                      <Spinner size="lg" />
                    </View>
                  </ClerkLoading>
                  <ClerkLoaded>
                    <SignedOut>
                      <SignInScreen />
                    </SignedOut>
                    <SignedIn>
                      <GroceryCopilotSession runtimeUrl={configured.runtimeUrl}>
                        <ThemeProvider value={navigationTheme}>
                          <Stack
                            screenOptions={{
                              contentStyle: { backgroundColor: background },
                              headerBackButtonDisplayMode: "minimal",
                              headerStyle: { backgroundColor: background },
                              headerTintColor: foreground,
                              headerTitleAlign: "center",
                              headerTitleStyle: { fontWeight: "800" },
                            }}
                          >
                            <Stack.Screen name="index" options={{ title: "Grocery Agent" }} />
                            <Stack.Screen name="chat" options={{ title: "Grocery Agent" }} />
                            <Stack.Screen name="list" options={{ title: "Your grocery plan" }} />
                            <Stack.Screen name="saved-lists" options={{ title: "Saved lists" }} />
                            <Stack.Screen name="saved-list" options={{ title: "Edit list" }} />
                            <Stack.Screen
                              name="saved-recipes"
                              options={{ title: "Saved recipes" }}
                            />
                            <Stack.Screen name="saved-recipe" options={{ title: "Edit recipe" }} />
                            <Stack.Screen
                              name="households"
                              options={{ title: "Shared households" }}
                            />
                            <Stack.Screen name="shared-list" options={{ title: "Shared list" }} />
                            <Stack.Screen name="chat-history" options={{ title: "Chat history" }} />
                            <Stack.Screen name="account" options={{ title: "Account" }} />
                            <Stack.Screen
                              name="report"
                              options={{ title: "Report a problem", presentation: "modal" }}
                            />
                            <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
                            <Stack.Screen name="kroger-callback" options={{ headerShown: false }} />
                          </Stack>
                        </ThemeProvider>
                      </GroceryCopilotSession>
                    </SignedIn>
                  </ClerkLoaded>
                </QueryProvider>
              </ClerkProvider>
            )}
          </BottomSheetModalProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </UniwindGestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
