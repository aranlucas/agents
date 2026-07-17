import { useUser } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { BrandMark } from "@/components/brand-mark";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Header,
  HeaderBackButton,
  HeaderLeft,
  HeaderRight,
  HeaderTitle,
} from "@/components/ui/header";
import { SafeArea } from "@/components/ui/safe-area";

type GroceryHeaderProps = {
  canGoBack: boolean;
  onBack: () => void;
  routeName: string;
  title: string;
};

export function GroceryHeader({ canGoBack, onBack, routeName, title }: GroceryHeaderProps) {
  const router = useRouter();
  const { user } = useUser();
  const showAccount = routeName === "index" || routeName === "chat";
  const fallback =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .map((part) => part?.charAt(0).toUpperCase())
      .join("") ||
    user?.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase() ||
    "?";

  return (
    <SafeArea className="flex-none" edges={["top"]}>
      <Header className="px-2">
        <HeaderLeft className="mr-1 min-w-12">
          {canGoBack ? (
            <HeaderBackButton onPress={onBack} />
          ) : (
            <Link href="/" asChild>
              <Pressable
                accessibilityLabel="Home"
                accessibilityRole="link"
                className="min-h-12 min-w-12 items-center justify-center rounded-full active:bg-muted"
              >
                <BrandMark size="sm" />
              </Pressable>
            </Link>
          )}
        </HeaderLeft>
        <HeaderTitle className="text-center font-extrabold">{title}</HeaderTitle>
        <HeaderRight className="ml-1 min-w-12 justify-end">
          {showAccount ? (
            <Button
              accessibilityLabel="Account"
              className="rounded-full p-0"
              onPress={() => router.push("/account")}
              size="icon"
              variant="outline"
            >
              <Avatar accessible={false} fallback={fallback} size="md" src={user?.imageUrl} />
            </Button>
          ) : null}
        </HeaderRight>
      </Header>
    </SafeArea>
  );
}
