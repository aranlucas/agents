import "@/shims/node-crypto";
import "@/global.css";
import { ClerkLoaded, ClerkLoading, ClerkProvider, SignedIn, SignedOut } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useResolveClassNames, withUniwind } from "uniwind";
import { ConfigurationError } from "@/components/configuration-error";
import { GroceryChatHeader } from "@/components/grocery-chat-header";
import { GroceryCopilotSession } from "@/components/grocery-copilot-session";
import { GroceryHeader } from "@/components/grocery-header";
import { QueryProvider } from "@/components/query-provider";
import { SignInScreen } from "@/components/sign-in-screen";
import { Spinner } from "@/components/ui/spinner";
import { getClerkPublishableKey, getRuntimeUrl } from "@/lib/config";

const UniwindGestureHandlerRootView = withUniwind(GestureHandlerRootView);

function configuration(): { clerkKey: string; runtimeUrl: string } | Error {
  try {
    return { clerkKey: getClerkPublishableKey(), runtimeUrl: getRuntimeUrl() };
  } catch (error) {
    return error instanceof Error ? error : new Error("This build is missing required settings.");
  }
}

export default function RootLayout() {
  const configured = configuration();
  const background = useResolveClassNames("bg-background").backgroundColor;
  return (
    <UniwindGestureHandlerRootView className="flex-1">
      <KeyboardProvider navigationBarTranslucent preserveEdgeToEdge statusBarTranslucent>
        <BottomSheetModalProvider>
          <SafeAreaProvider>
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
                        <Stack
                          screenOptions={{
                            contentStyle: { backgroundColor: background },
                            header: ({ back, navigation, options, route }) => (
                              <GroceryHeader
                                canGoBack={Boolean(back)}
                                onBack={() => navigation.goBack()}
                                showAccount={route.name === "index"}
                                title={
                                  typeof options.title === "string" ? options.title : route.name
                                }
                              />
                            ),
                          }}
                        >
                          <Stack.Screen name="index" options={{ title: "Grocery Agent" }} />
                          <Stack.Screen
                            name="chat"
                            options={{
                              title: "Grocery Agent",
                              header: ({ back, navigation }) => (
                                <GroceryChatHeader
                                  canGoBack={Boolean(back)}
                                  onBack={() => navigation.goBack()}
                                />
                              ),
                            }}
                          />
                          <Stack.Screen name="list" options={{ title: "Your grocery plan" }} />
                          <Stack.Screen name="saved-recipes" options={{ title: "Saved recipes" }} />
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
                      </GroceryCopilotSession>
                    </SignedIn>
                  </ClerkLoaded>
                </QueryProvider>
              </ClerkProvider>
            )}
          </SafeAreaProvider>
        </BottomSheetModalProvider>
      </KeyboardProvider>
    </UniwindGestureHandlerRootView>
  );
}
