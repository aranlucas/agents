import EditSquare from "@expo/material-symbols/edit_square.xml";
import History from "@expo/material-symbols/history.xml";
import Settings from "@expo/material-symbols/settings.xml";
import { Stack, useRouter } from "expo-router";
import { GroceryChat } from "@/components/grocery-chat";
import { useGroceryAgent } from "@/components/grocery-agent-provider";

export default function GroceryChatScreen() {
  const router = useRouter();
  const { startNewChat } = useGroceryAgent();

  return (
    <>
      <GroceryChat />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Previous chats"
          icon={process.env.EXPO_OS === "android" ? History : "clock.arrow.circlepath"}
          onPress={() => router.push("/chat-history")}
        />
        <Stack.Toolbar.Button
          accessibilityLabel="New chat"
          icon={process.env.EXPO_OS === "android" ? EditSquare : "square.and.pencil"}
          onPress={() => void startNewChat()}
        />
        <Stack.Toolbar.Button
          accessibilityLabel="Settings"
          icon={process.env.EXPO_OS === "android" ? Settings : "gearshape"}
          onPress={() => router.push("/account")}
        />
      </Stack.Toolbar>
    </>
  );
}
