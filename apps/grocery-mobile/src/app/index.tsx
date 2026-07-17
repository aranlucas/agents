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
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export default function GroceryHomeScreen() {
  const { user } = useUser();
  const { state } = useGroceryAgent();
  const planItemCount = Math.max(state.shopping_list?.length ?? 0, state.cart?.length ?? 0);
  const firstName = user?.firstName;

  return (
    <ScrollView
      className="w-full max-w-3xl flex-1 self-center bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-5 p-4 pb-10"
    >
      <View className="gap-1 px-1">
        <Text selectable variant="small">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </Text>
        <Text selectable variant="h2">
          Plan, shop, and share.
        </Text>
        <Text selectable>
          Start in chat, review your grocery plan, then keep everyone in sync with a household.
        </Text>
      </View>

      <Card className="rounded-3xl border-secondary bg-secondary p-0">
        <CardHeader className="flex-row items-start gap-3 p-5 pb-0">
          <View className="size-12 items-center justify-center rounded-2xl bg-accent">
            <Icon as={MessageSquareText} className="size-6 text-accent-foreground" />
          </View>
          <View className="flex-1 gap-1">
            <Text className="font-extrabold tracking-wider text-accent uppercase" variant="small">
              Start here
            </Text>
            <CardTitle
              className="font-extrabold tracking-normal text-secondary-foreground"
              selectable
            >
              What do you need this week?
            </CardTitle>
            <CardDescription
              className="text-base leading-5 text-secondary-foreground/80"
              selectable
            >
              Ask for meals, recipes, a budget plan, or a ready-to-review grocery list.
            </CardDescription>
          </View>
        </CardHeader>
        <CardFooter className="p-5">
          <Link href="/chat" asChild>
            <Button
              className="flex-1 bg-card"
              iconAfter={<Icon as={ArrowRight} className="size-5 text-secondary" />}
              size="lg"
              textClassName="font-extrabold text-secondary"
              variant="outline"
            >
              Plan with Grocery Agent
            </Button>
          </Link>
        </CardFooter>
      </Card>

      <View className="gap-3">
        <Text selectable variant="h4">
          Your shopping
        </Text>
        <Link href="/list" asChild>
          <Pressable accessibilityRole="button">
            <Card className="rounded-2xl p-0 active:bg-muted">
              <CardHeader className="flex-row items-center gap-3 p-4">
                <View className="size-12 items-center justify-center rounded-2xl bg-muted">
                  <Icon as={ShoppingBasket} className="size-6 text-primary" />
                </View>
                <View className="flex-1 gap-1">
                  <CardTitle className="text-base font-extrabold tracking-normal" selectable>
                    Grocery plan
                  </CardTitle>
                  <CardDescription className="leading-5" selectable>
                    {planItemCount > 0
                      ? `${planItemCount} ${planItemCount === 1 ? "item" : "items"} ready to review`
                      : "Your active list, product matches, and cart"}
                  </CardDescription>
                </View>
                <Icon as={ArrowRight} className="size-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Pressable>
        </Link>

        <Link href="/households" asChild>
          <Pressable accessibilityRole="button">
            <Card className="rounded-2xl p-0 active:bg-muted">
              <CardHeader className="flex-row items-center gap-3 p-4">
                <View className="size-12 items-center justify-center rounded-2xl bg-muted">
                  <Icon as={Users} className="size-6 text-primary" />
                </View>
                <View className="flex-1 gap-1">
                  <CardTitle className="text-base font-extrabold tracking-normal" selectable>
                    Household
                  </CardTitle>
                  <CardDescription className="leading-5" selectable>
                    Create or join a household and open its shared grocery list.
                  </CardDescription>
                </View>
                <Icon as={ArrowRight} className="size-5 text-muted-foreground" />
              </CardHeader>
            </Card>
          </Pressable>
        </Link>
      </View>

      <View className="gap-3">
        <Text className="px-1 font-extrabold tracking-normal" selectable variant="h4">
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
            description="Rebuild a list fast"
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
        <Card className="min-h-36 flex-1 rounded-2xl p-0 active:bg-muted">
          <CardHeader className="gap-3 p-4">
            <View className="size-10 items-center justify-center rounded-xl bg-muted">
              <Icon as={icon} className="size-5 text-primary" />
            </View>
            <View className="gap-1">
              <CardTitle className="text-base font-extrabold tracking-normal" selectable>
                {title}
              </CardTitle>
              <CardDescription className="leading-5" selectable>
                {description}
              </CardDescription>
            </View>
          </CardHeader>
        </Card>
      </Pressable>
    </Link>
  );
}
