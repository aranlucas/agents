import "@/shims/node-crypto";
import { ClerkLoaded, ClerkLoading, ClerkProvider, SignedIn, SignedOut } from "@clerk/clerk-expo";
import { resourceCache } from "@clerk/clerk-expo/resource-cache";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConfigurationError } from "@/components/configuration-error";
import { GroceryCopilotSession } from "@/components/grocery-copilot-session";
import { SignInScreen } from "@/components/sign-in-screen";
import { getClerkPublishableKey, getRuntimeUrl } from "@/lib/config";
import { colors } from "@/lib/theme";

function configuration(): { clerkKey: string; runtimeUrl: string } | Error {
  try {
    return { clerkKey: getClerkPublishableKey(), runtimeUrl: getRuntimeUrl() };
  } catch (error) {
    return error instanceof Error ? error : new Error("This build is missing required settings.");
  }
}

export default function RootLayout() {
  const configured = configuration();
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {configured instanceof Error ? (
          <ConfigurationError message={configured.message} />
        ) : (
          <ClerkProvider
            publishableKey={configured.clerkKey}
            tokenCache={tokenCache}
            __experimental_resourceCache={resourceCache}
          >
            <ClerkLoading>
              <View style={styles.loading}>
                <ActivityIndicator color={colors.green} size="large" />
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
                      headerStyle: { backgroundColor: colors.background },
                      headerShadowVisible: false,
                      headerTintColor: colors.forest,
                      headerTitleStyle: { color: colors.ink, fontWeight: "700" },
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  >
                    <Stack.Screen name="index" options={{ title: "Grocery Agent" }} />
                    <Stack.Screen name="list" options={{ title: "Your grocery plan" }} />
                    <Stack.Screen name="saved-recipes" options={{ title: "Saved recipes" }} />
                    <Stack.Screen name="households" options={{ title: "Shared households" }} />
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
          </ClerkProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
