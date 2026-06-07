import { Sidebar, SidebarToggle } from "@/components/sidebar";
import "@/global.css";
import { ClerkProvider } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

export default function RootLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const publishableKey =
    Constants.expoConfig?.extra?.clerkPublishableKey ??
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    "";

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <View className="bg-sidebar flex h-dvh w-full flex-row">
        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          isCollapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((v) => !v)}
        />

        {/* Main content area */}
        <View className="flex min-w-0 flex-1 flex-col">
          {/* Chat header */}
          <View className="bg-sidebar flex h-14 shrink-0 flex-row items-center gap-2 px-3">
            {/* Mobile sidebar toggle only — desktop uses the collapsed rail */}
            <View className="md:hidden">
              <SidebarToggle onPress={() => setSidebarOpen(true)} />
            </View>

            {/* Visibility / title area - right side */}
            <View className="hidden md:ml-auto md:flex md:flex-row md:items-center md:gap-2">
              <Pressable className="bg-foreground hover:bg-foreground/90 flex h-8 flex-row items-center gap-1.5 rounded-lg px-4">
                <Text className="text-background text-[13px] font-medium">Launch now</Text>
              </Pressable>
            </View>
          </View>

          {/* Inset content panel */}
          <View className="bg-background md:border-border/40 flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-tl-xl md:border-t md:border-l">
            <Slot />
          </View>
        </View>

        <StatusBar style="auto" />
      </View>
    </ClerkProvider>
  );
}
