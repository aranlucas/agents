import { useUser } from "@clerk/clerk-expo";
import AccountCircle from "@expo/material-symbols/account_circle.xml";
import ShoppingBasketIcon from "@expo/material-symbols/shopping_basket.xml";
import { Link, Stack, useRouter } from "expo-router";
import {
  ArrowRight,
  BookMarked,
  CircleUserRound,
  History,
  ListChecks,
  MessageSquareText,
  ShoppingBasket,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { HeaderActionButton } from "@/components/header-action-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { useGroceryState } from "@/hooks/use-grocery-agent";

export default function GroceryHomeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const state = useGroceryState();
  const planItemCount = Math.max(state.shopping_list?.length ?? 0, state.cart?.length ?? 0);
  const firstName = user?.firstName;

  return (
    <>
      <Screen contentContainerClassName="gap-5">
        <View className="gap-1">
          <Text selectable variant="muted">
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
              <CardTitle className="text-secondary-foreground" selectable>
                What do you need this week?
              </CardTitle>
              <CardDescription className="text-base text-secondary-foreground/80" selectable>
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
          <HomeLinkRow
            description={
              planItemCount > 0
                ? `${planItemCount} ${planItemCount === 1 ? "item" : "items"} ready to review`
                : "Your active list, product matches, and cart"
            }
            href="/list"
            icon={ShoppingBasket}
            title="Grocery plan"
          />
          <HomeLinkRow
            description="Reopen and edit personal or household grocery lists."
            href="/saved-lists"
            icon={ListChecks}
            title="Saved lists"
          />
          <HomeLinkRow
            description="Create or join a household and open its shared grocery list."
            href="/households"
            icon={Users}
            title="Household"
          />
        </View>

        <View className="gap-3">
          <Text selectable variant="h4">
            Pick up where you left off
          </Text>
          <View className="gap-3 sm:flex-row">
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
      </Screen>
      {process.env.EXPO_OS === "web" ? (
        <Stack.Screen
          options={{
            headerLeft: () => (
              <HeaderActionButton
                accessibilityLabel="Home"
                icon={ShoppingBasket}
                onPress={() => router.replace("/")}
              />
            ),
            headerRight: () => (
              <HeaderActionButton
                accessibilityLabel="Account"
                icon={CircleUserRound}
                onPress={() => router.push("/account")}
              />
            ),
          }}
        />
      ) : (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              accessibilityLabel="Home"
              icon={process.env.EXPO_OS === "android" ? ShoppingBasketIcon : "basket.fill"}
              onPress={() => router.replace("/")}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              accessibilityLabel="Account"
              icon={process.env.EXPO_OS === "android" ? AccountCircle : "person.crop.circle"}
              onPress={() => router.push("/account")}
            />
          </Stack.Toolbar>
        </>
      )}
    </>
  );
}

function HomeLinkRow({
  description,
  href,
  icon,
  title,
}: {
  description: string;
  href: "/list" | "/saved-lists" | "/households";
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="button" className="active:opacity-80">
        <Card className="p-0">
          <CardHeader className="flex-row items-center gap-3 p-4">
            <View className="size-12 items-center justify-center rounded-2xl bg-muted">
              <Icon as={icon} className="size-6 text-primary" />
            </View>
            <View className="flex-1 gap-1">
              <CardTitle selectable>{title}</CardTitle>
              <CardDescription selectable>{description}</CardDescription>
            </View>
            <Icon as={ArrowRight} className="size-5 text-muted-foreground" />
          </CardHeader>
        </Card>
      </Pressable>
    </Link>
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
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="button" className="flex-1 active:opacity-80">
        <Card className="min-h-36 flex-1 p-0">
          <CardHeader className="gap-3 p-4">
            <View className="size-10 items-center justify-center rounded-xl bg-muted">
              <Icon as={icon} className="size-5 text-primary" />
            </View>
            <View className="gap-1">
              <CardTitle selectable>{title}</CardTitle>
              <CardDescription selectable>{description}</CardDescription>
            </View>
          </CardHeader>
        </Card>
      </Pressable>
    </Link>
  );
}
