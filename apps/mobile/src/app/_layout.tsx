// oxlint-disable-next-line import/no-unassigned-import
import "@/shims/node-crypto";
import { CopilotKitProvider } from "@copilotkit/react-native";
import { ClerkProvider } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { Tabs } from "expo-router";
import { Dumbbell, HeartPulse, LayoutTemplate, Plane, ShoppingCart } from "lucide-react-native";
import { useColorScheme, type ColorValue } from "react-native";
import Constants from "expo-constants";
import { getCopilotKitRuntimeUrl } from "@/utils/agent-config";

type TabIconProps = {
  color: ColorValue;
  size: number;
};

function TravelIcon({ color, size }: TabIconProps) {
  return <Plane color={String(color)} size={size} />;
}

function GroceryIcon({ color, size }: TabIconProps) {
  return <ShoppingCart color={String(color)} size={size} />;
}

function FitnessIcon({ color, size }: TabIconProps) {
  return <Dumbbell color={String(color)} size={size} />;
}

function WellnessIcon({ color, size }: TabIconProps) {
  return <HeartPulse color={String(color)} size={size} />;
}

function A2UIIcon({ color, size }: TabIconProps) {
  return <LayoutTemplate color={String(color)} size={size} />;
}

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function TabLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isDark ? "#000" : "#fff",
          borderTopColor: isDark ? "#222" : "#e5e5e5",
        },
        tabBarActiveTintColor: isDark ? "#fff" : "#000",
        tabBarInactiveTintColor: isDark ? "#666" : "#999",
      }}
    >
      <Tabs.Screen
        name="travel"
        options={{
          title: "Travel",
          tabBarIcon: TravelIcon,
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: "Grocery",
          tabBarIcon: GroceryIcon,
        }}
      />
      <Tabs.Screen
        name="fitness"
        options={{
          title: "Fitness",
          tabBarIcon: FitnessIcon,
        }}
      />
      <Tabs.Screen
        name="wellness"
        options={{
          title: "Wellness",
          tabBarIcon: WellnessIcon,
        }}
      />
      <Tabs.Screen
        name="a2ui"
        options={{
          title: "A2UI",
          tabBarIcon: A2UIIcon,
        }}
      />
      {/* Hide all other routes from the tab bar */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="chats" options={{ href: null }} />
      <Tabs.Screen name="attachments" options={{ href: null }} />
      <Tabs.Screen name="model-picker" options={{ href: null }} />
      <Tabs.Screen name="(settings)" options={{ href: null }} />
    </Tabs>
  );
}

export default function RootLayout() {
  const publishableKey =
    Constants.expoConfig?.extra?.clerkPublishableKey ??
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    "";

  const runtimeUrl = getCopilotKitRuntimeUrl() ?? "";

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <CopilotKitProvider runtimeUrl={runtimeUrl}>
        <TabLayout />
      </CopilotKitProvider>
    </ClerkProvider>
  );
}
