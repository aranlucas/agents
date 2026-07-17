import { useRouter } from "expo-router";
import { History, Settings, SquarePen } from "lucide-react-native";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { Button } from "@/components/ui/button";
import { Header, HeaderBackButton, HeaderLeft, HeaderRight } from "@/components/ui/header";
import { Icon } from "@/components/ui/icon";

export function GroceryChatHeader({
  canGoBack,
  onBack,
}: {
  canGoBack: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const { startNewChat } = useGroceryAgent();

  return (
    <View className="flex-none bg-background">
      <SafeAreaView edges={["top"]} style={{ flexGrow: 0, flexShrink: 0 }}>
        <Header className="px-2">
          <HeaderLeft className="mr-1 min-w-12 flex-1">
            <HeaderBackButton onPress={canGoBack ? onBack : () => router.replace("/")} />
          </HeaderLeft>
          <HeaderRight className="ml-1 min-w-12 flex-1 justify-end gap-1">
            <Button
              accessibilityLabel="Previous chats"
              className="rounded-full"
              icon={<Icon as={History} className="size-4 text-foreground" />}
              onPress={() => router.push("/chat-history")}
              size="icon"
              variant="outline"
            />
            <Button
              accessibilityLabel="New chat"
              className="rounded-full"
              icon={<Icon as={SquarePen} className="size-5 text-foreground" />}
              onPress={() => void startNewChat()}
              size="icon"
              variant="outline"
            />
            <Button
              accessibilityLabel="Settings"
              className="rounded-full"
              icon={<Icon as={Settings} className="size-5 text-foreground" />}
              onPress={() => router.push("/account")}
              size="icon"
              variant="outline"
            />
          </HeaderRight>
        </Header>
      </SafeAreaView>
    </View>
  );
}
