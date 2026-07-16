import { useUser } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import {
  ArrowRight,
  BookMarked,
  History,
  MessageSquareText,
  ShoppingBasket,
  Users,
} from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export default function GroceryHomeScreen() {
  const { user } = useUser();
  const { state } = useGroceryAgent();
  const planItemCount = Math.max(state.shopping_list?.length ?? 0, state.cart?.length ?? 0);
  const firstName = user?.firstName;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-5 p-4 pb-10"
    >
      <View className="gap-1 px-1">
        <Text className="text-sm font-semibold text-primary" selectable>
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </Text>
        <Text className="text-3xl font-extrabold tracking-tight" selectable>
          Plan, shop, and share.
        </Text>
        <Text className="leading-6 text-muted-foreground" selectable>
          Start in chat, review your grocery plan, then keep everyone in sync with a household.
        </Text>
      </View>

      <Card className="gap-5 rounded-3xl border-secondary bg-secondary p-5">
        <View className="flex-row items-start gap-3">
          <View className="size-12 items-center justify-center rounded-2xl bg-accent">
            <Icon as={MessageSquareText} className="size-6 text-accent-foreground" />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-xs font-extrabold tracking-wider text-accent uppercase">
              Start here
            </Text>
            <Text className="text-2xl font-extrabold text-secondary-foreground" selectable>
              What do you need this week?
            </Text>
            <Text className="leading-5 text-secondary-foreground/80" selectable>
              Ask for meals, recipes, a budget plan, or a ready-to-review grocery list.
            </Text>
          </View>
        </View>
        <Link href="/chat" asChild>
          <Button className="bg-card" size="lg" variant="outline">
            <Text className="font-extrabold text-secondary">Plan with Grocery Agent</Text>
            <Icon as={ArrowRight} className="size-5 text-secondary" />
          </Button>
        </Link>
      </Card>

      <View className="gap-3">
        <Text className="px-1 text-xl font-extrabold" selectable>
          Your shopping
        </Text>
        <Link href="/list" asChild>
          <Pressable accessibilityRole="button">
            <Card className="flex-row items-center gap-3 rounded-2xl p-4 active:bg-muted">
              <View className="size-12 items-center justify-center rounded-2xl bg-muted">
                <Icon as={ShoppingBasket} className="size-6 text-primary" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="font-extrabold" selectable>
                  Grocery plan
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground" selectable>
                  {planItemCount > 0
                    ? `${planItemCount} ${planItemCount === 1 ? "item" : "items"} ready to review`
                    : "Your active list, product matches, and cart"}
                </Text>
              </View>
              <Icon as={ArrowRight} className="size-5 text-muted-foreground" />
            </Card>
          </Pressable>
        </Link>

        <Link href="/households" asChild>
          <Pressable accessibilityRole="button">
            <Card className="flex-row items-center gap-3 rounded-2xl border-primary/30 bg-muted p-4 active:bg-accent/40">
              <View className="size-12 items-center justify-center rounded-2xl bg-card">
                <Icon as={Users} className="size-6 text-primary" />
              </View>
              <View className="flex-1 gap-1">
                <Text className="font-extrabold" selectable>
                  Household
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground" selectable>
                  Create or join a household and open its shared grocery list.
                </Text>
              </View>
              <Icon as={ArrowRight} className="size-5 text-primary" />
            </Card>
          </Pressable>
        </Link>
      </View>

      <View className="gap-3">
        <Text className="px-1 text-xl font-extrabold" selectable>
          Pick up where you left off
        </Text>
        <View className="flex-row gap-3">
          <HomeShortcut
            description="Resume a conversation"
            href="/chat-history"
            icon={History}
            title="Chat history"
          />
          <HomeShortcut
            description="Reuse favorite meals"
            href="/saved-recipes"
            icon={BookMarked}
            title="Saved recipes"
          />
        </View>
      </View>
    </ScrollView>
  );
}

function HomeShortcut({
  description,
  href,
  icon,
  title,
}: {
  description: string;
  href: "/chat-history" | "/saved-recipes";
  icon: typeof BookMarked;
  title: string;
}) {
  return (
    <Link className="flex-1" href={href} asChild>
      <Pressable accessibilityRole="button" className="flex-1">
        <Card className="min-h-36 flex-1 gap-3 rounded-2xl p-4 active:bg-muted">
          <View className="size-10 items-center justify-center rounded-xl bg-muted">
            <Icon as={icon} className="size-5 text-secondary" />
          </View>
          <View className="gap-1">
            <Text className="font-extrabold" selectable>
              {title}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground" selectable>
              {description}
            </Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
