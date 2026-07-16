// oxlint-disable-next-line import/no-unassigned-import
import "@/shims/node-crypto";
import { CopilotKitProvider } from "@copilotkit/react-native";
import { ClerkProvider } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { AppTabs } from "@/components/app-tabs";
import { getCopilotKitRuntimeUrl } from "@/utils/agent-config";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

export default function RootLayout() {
  const publishableKey =
    Constants.expoConfig?.extra?.clerkPublishableKey ??
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    "";

  const runtimeUrl = getCopilotKitRuntimeUrl();

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <CopilotKitProvider runtimeUrl={runtimeUrl} useSingleEndpoint={false} defaultThrottleMs={0}>
        <AppTabs />
      </CopilotKitProvider>
    </ClerkProvider>
  );
}
