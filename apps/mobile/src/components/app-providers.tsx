import { ClerkProvider, type TokenCache } from "@clerk/expo";
import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import Constants from "expo-constants";
import type { ReactNode } from "react";
import { getCopilotKitRuntimeUrl } from "@/utils/agent-config";

type AppProvidersProps = {
  children: ReactNode;
  tokenCache?: TokenCache;
};

export function AppProviders({ children, tokenCache }: AppProvidersProps) {
  const publishableKey =
    Constants.expoConfig?.extra?.clerkPublishableKey ??
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    "";

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <CopilotKitProvider
        defaultThrottleMs={0}
        runtimeUrl={getCopilotKitRuntimeUrl()}
        useSingleEndpoint={false}
      >
        {children}
      </CopilotKitProvider>
    </ClerkProvider>
  );
}
