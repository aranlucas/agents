import { Tabs } from "expo-router";
import { Dumbbell, HeartPulse, Plane, ShoppingCart } from "lucide-react-native";
import { useColorScheme, type ColorValue } from "react-native";

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

export function AppTabs() {
  const isDark = useColorScheme() === "dark";

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
      <Tabs.Screen name="travel" options={{ title: "Travel", tabBarIcon: TravelIcon }} />
      <Tabs.Screen name="grocery" options={{ title: "Grocery", tabBarIcon: GroceryIcon }} />
      <Tabs.Screen name="fitness" options={{ title: "Fitness", tabBarIcon: FitnessIcon }} />
      <Tabs.Screen name="wellness" options={{ title: "Wellness", tabBarIcon: WellnessIcon }} />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
