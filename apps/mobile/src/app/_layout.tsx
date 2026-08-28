// oxlint-disable-next-line import/no-unassigned-import
import "@/shims/node-crypto";
// Installs the Hermes globals CopilotKit needs (streams, encoding, ...). The
// crypto shim above runs first so the secure expo-crypto RNG wins the
// first-writer race against the package's Math.random fallback.
// oxlint-disable-next-line import/no-unassigned-import
import "@copilotkit/react-native/polyfills";
import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { ClerkProvider } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { AppTabs } from "@/components/app-tabs";
import { getCopilotKitRuntimeUrl } from "@/utils/agent-config";
import { Sentry } from "@/utils/sentry";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function RootLayout() {
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

export default Sentry.wrap(RootLayout);
