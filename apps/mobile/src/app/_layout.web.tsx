import { ClerkProvider } from "@clerk/expo";
import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { AppTabs } from "@/components/app-tabs";
import { getCopilotKitRuntimeUrl } from "@/utils/agent-config";
import { Sentry } from "@/utils/sentry";

function RootLayout() {
  const publishableKey =
    Constants.expoConfig?.extra?.clerkPublishableKey ??
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    "";
  const runtimeUrl = getCopilotKitRuntimeUrl();

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <CopilotKitProvider runtimeUrl={runtimeUrl} useSingleEndpoint={false} defaultThrottleMs={0}>
        <AppTabs />
        <StatusBar style="auto" />
      </CopilotKitProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
