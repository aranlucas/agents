import { ClerkProvider } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { Tabs } from "expo-router";
import { Plane, ShoppingCart } from "lucide-react-native";
import { useColorScheme } from "react-native";
import Constants from "expo-constants";

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
          tabBarIcon: ({ color, size }) => <Plane color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: "Grocery",
          tabBarIcon: ({ color, size }) => (
            <ShoppingCart color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function RootLayout() {
  const publishableKey =
    Constants.expoConfig?.extra?.clerkPublishableKey ??
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    "";

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <TabLayout />
    </ClerkProvider>
  );
}
