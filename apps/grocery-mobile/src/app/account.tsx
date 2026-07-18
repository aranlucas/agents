import { useClerk, useUser } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  BookMarked,
  ChevronRight,
  CircleHelp,
  FileText,
  Flag,
  ListChecks,
  LogOut,
  Shield,
  ShoppingBasket,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Screen } from "@/components/ui/screen";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
import { userInitials } from "@/lib/auth";
import { getLegalLinks } from "@/lib/config";
import { cn } from "@/lib/utils";

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const connection = useKrogerConnection();
  const { connected, isLoading, reconnecting, error: connectionError } = connection;
  const [pageError, setPageError] = useState("");
  const links = getLegalLinks();
  const fallback = userInitials(user);

  const open = async (url: string) => {
    setPageError("");
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      setPageError("That page could not be opened. Check your connection and try again.");
    }
  };

  const updateKrogerConnection = () => {
    connection.clearError();
    void (connected ? connection.reconnect() : connection.connect());
  };

  return (
    <Screen>
      <View className="flex-row items-center gap-3 py-1.5">
        <Avatar
          accessibilityLabel={user?.fullName ?? "Account profile"}
          fallback={fallback}
          size="lg"
          src={user?.imageUrl}
        />
        <View className="flex-1 gap-0.5">
          <Text selectable variant="h4">
            {user?.fullName ?? "Grocery Agent member"}
          </Text>
          <Text selectable variant="muted">
            {user?.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </View>

      <Card>
        <CardHeader className="flex-row items-center gap-3 pb-0">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            <Icon as={ShoppingBasket} className="size-5.5 text-primary" />
          </View>
          <View className="flex-1 gap-0.5">
            <CardTitle>Kroger</CardTitle>
            <CardDescription>
              {connected
                ? "Connected for live products and cart actions"
                : "Optional for live products and cart actions"}
            </CardDescription>
          </View>
          <Badge variant={connected ? "secondary" : "destructive"}>
            {connected ? "Connected" : "Action needed"}
          </Badge>
        </CardHeader>
        <CardFooter className="pt-3.5">
          <Button
            className="flex-1"
            disabled={isLoading}
            size="lg"
            variant="secondary"
            onPress={updateKrogerConnection}
          >
            {reconnecting
              ? "Reconnecting Kroger…"
              : connected
                ? "Reconnect Kroger"
                : "Connect Kroger"}
          </Button>
        </CardFooter>
      </Card>

      <Text variant="muted">Shopping</Text>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <AccountRow
            accessibilityRole="button"
            icon={ShoppingBasket}
            label="Grocery plan"
            onPress={() => router.push("/list")}
          />
          <RowRule />
          <AccountRow
            accessibilityRole="button"
            icon={ListChecks}
            label="Saved lists"
            onPress={() => router.push("/saved-lists")}
          />
          <RowRule />
          <AccountRow
            accessibilityRole="button"
            icon={BookMarked}
            label="Saved recipes"
            onPress={() => router.push("/saved-recipes")}
          />
        </CardContent>
      </Card>

      <Text variant="muted">Help and legal</Text>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <AccountRow
            icon={Shield}
            label="Privacy policy"
            onPress={() => void open(links.privacy)}
          />
          <RowRule />
          <AccountRow icon={FileText} label="Terms of use" onPress={() => void open(links.terms)} />
          <RowRule />
          <AccountRow
            icon={CircleHelp}
            label="Help and support"
            onPress={() => void open(links.support)}
          />
          <RowRule />
          <AccountRow
            destructive
            icon={Trash2}
            label="Delete account"
            onPress={() => void open(links.deleteAccount)}
          />
        </CardContent>
      </Card>

      {connectionError || pageError ? (
        <Alert title={connectionError || pageError} variant="destructive" />
      ) : null}
      <Button
        icon={<Icon as={Flag} className="size-4.5 text-foreground" />}
        size="lg"
        variant="outline"
        onPress={() => router.push("/report")}
      >
        Report a problem
      </Button>
      <Button
        icon={<Icon as={LogOut} className="size-4.5 text-foreground" />}
        size="lg"
        variant="outline"
        onPress={() => void signOut()}
      >
        Sign out
      </Button>
      <Text className="text-center" selectable variant="muted">
        Grocery Agent {Constants.expoConfig?.version ?? ""}
      </Text>
    </Screen>
  );
}

function AccountRow({
  accessibilityRole = "link",
  destructive = false,
  icon,
  label,
  onPress,
}: {
  accessibilityRole?: "link" | "button";
  destructive?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      className="min-h-14 flex-row items-center gap-3 px-4 active:bg-muted"
      onPress={onPress}
    >
      <View className="w-7 items-center">
        <Icon as={icon} className={cn("size-5 text-primary", destructive && "text-destructive")} />
      </View>
      <Text className="flex-1" variant="large">
        {label}
      </Text>
      <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
    </Pressable>
  );
}

function RowRule() {
  return <Separator className="ml-14" />;
}
