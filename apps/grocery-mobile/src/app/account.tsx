import { useClerk, useUser } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  ChevronRight,
  CircleHelp,
  FileText,
  LogOut,
  Shield,
  ShoppingBasket,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";
import { ErrorAlert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useKrogerConnection } from "@/hooks/use-kroger-connection";
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
  const fallback =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .map((part) => part?.charAt(0).toUpperCase())
      .join("") ||
    user?.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase() ||
    "?";

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
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-4 p-4.5 pb-10"
    >
      <View className="flex-row items-center gap-3 py-1.5">
        <Avatar
          accessibilityLabel={user?.fullName ?? "Account profile"}
          fallback={fallback}
          size="lg"
          src={user?.imageUrl}
        />
        <View className="flex-1 gap-0.5">
          <Text className="text-xl font-extrabold" selectable>
            {user?.fullName ?? "Grocery Agent member"}
          </Text>
          <Text selectable variant="muted">
            {user?.primaryEmailAddress?.emailAddress}
          </Text>
        </View>
      </View>

      <Card className="gap-3.5 rounded-2xl p-4">
        <View className="flex-row items-center gap-3">
          <View className="size-11 items-center justify-center rounded-2xl bg-muted">
            <Icon as={ShoppingBasket} className="size-5.5 text-primary" />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-extrabold">Kroger</Text>
            <Text className="text-xs text-muted-foreground">
              {connected
                ? "Connected for live products and cart actions"
                : "Optional for live products and cart actions"}
            </Text>
          </View>
          <Badge variant={connected ? "secondary" : "destructive"}>
            <Text className="text-xs font-extrabold">
              {connected ? "Connected" : "Action needed"}
            </Text>
          </Badge>
        </View>
        <Button disabled={isLoading} size="lg" variant="secondary" onPress={updateKrogerConnection}>
          {reconnecting
            ? "Reconnecting Kroger…"
            : connected
              ? "Reconnect Kroger"
              : "Connect Kroger"}
        </Button>
      </Card>

      <Text className="mt-1 ml-1 text-xs font-extrabold tracking-wider text-muted-foreground uppercase">
        Help and legal
      </Text>
      <Card className="gap-0 overflow-hidden rounded-2xl p-0">
        <AccountRow icon={Shield} label="Privacy policy" onPress={() => void open(links.privacy)} />
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
      </Card>

      {connectionError || pageError ? <ErrorAlert message={connectionError || pageError} /> : null}
      <Button size="lg" variant="secondary" onPress={() => router.push("/report")}>
        Report a problem
      </Button>
      <Button size="lg" onPress={() => void signOut()}>
        <View className="flex-row items-center gap-2">
          <Icon as={LogOut} className="size-4.5 text-primary-foreground" />
          <Text className="text-base font-bold text-primary-foreground">Sign out</Text>
        </View>
      </Button>
      <Text className="text-center" selectable variant="muted">
        Grocery Agent 1.0.0
      </Text>
    </ScrollView>
  );
}

function AccountRow({
  destructive = false,
  icon,
  label,
  onPress,
}: {
  destructive?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      className="min-h-14 flex-row items-center gap-3 px-4 active:bg-muted"
      onPress={onPress}
    >
      <View className="w-7 items-center">
        <Icon as={icon} className={cn("size-5 text-primary", destructive && "text-destructive")} />
      </View>
      <Text className="flex-1 text-sm font-semibold">{label}</Text>
      <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
    </Pressable>
  );
}

function RowRule() {
  return <View className="ml-14 h-px bg-border" />;
}
