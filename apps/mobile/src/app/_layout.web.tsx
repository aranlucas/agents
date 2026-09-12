import { StatusBar } from "expo-status-bar";
import { AppProviders } from "@/components/app-providers";
import { AppTabs } from "@/components/app-tabs";
import { Sentry } from "@/utils/sentry";

function RootLayout() {
  return (
    <AppProviders>
      <AppTabs />
      <StatusBar style="auto" />
    </AppProviders>
  );
}

export default Sentry.wrap(RootLayout);
