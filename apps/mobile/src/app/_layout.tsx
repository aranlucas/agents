// oxlint-disable-next-line import/no-unassigned-import
import "@/shims/node-crypto";
// Installs the Hermes globals CopilotKit needs (streams, encoding, ...). The
// crypto shim above runs first so the secure expo-crypto RNG wins the
// first-writer race against the package's Math.random fallback.
// oxlint-disable-next-line import/no-unassigned-import
import "@copilotkit/react-native/polyfills";
import * as SecureStore from "expo-secure-store";
import { AppProviders } from "@/components/app-providers";
import { AppTabs } from "@/components/app-tabs";
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
  return (
    <AppProviders tokenCache={tokenCache}>
      <AppTabs />
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);
