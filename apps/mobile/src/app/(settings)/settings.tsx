import { Icon } from "@/components/icon";
import { Link } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  CircleUser,
  Globe,
  LayoutGrid,
  Link2,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  SunMoon,
  TrendingUp,
  Users,
  Vibrate,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";

export default function SettingsScreen() {
  const [hapticFeedback, setHapticFeedback] = useState(true);

  return (
    <ScrollView
      className="bg-background text-foreground flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="android:pb-safe"
    >
      {/* Email */}
      <View className="bg-muted border-continuous mx-5 mt-4 mb-5 rounded-xl px-4 py-3">
        <Text selectable className="text-foreground text-[15px]">
          developer@expo.dev
        </Text>
      </View>

      {/* Account */}
      <SettingsRow icon={CircleUser} label="Profile" href="/(settings)/profile" />
      <SettingsRow icon={CircleDollarSign} label="Billing" detail="Max plan" />
      <SettingsRow icon={TrendingUp} label="Usage" />

      <SectionDivider />

      {/* Features */}
      <SettingsRow icon={SlidersHorizontal} label="Capabilities" href="/(settings)/capabilities" />
      <SettingsRow icon={LayoutGrid} label="Connectors" />
      <SettingsRow icon={Users} label="Permissions" />

      <SectionDivider />

      {/* Preferences */}
      <SettingsRow icon={SunMoon} label="Appearance" detail="System" />
      <SettingsRow icon={Globe} label="Speech language" detail="EN" />
      <SettingsRow icon={Bell} label="Notifications" />
      <SettingsRow icon={ShieldCheck} label="Privacy" />
      <SettingsRow icon={Link2} label="Shared links" />

      <SectionDivider />

      {/* Toggles */}
      <SettingsToggleRow
        icon={Vibrate}
        label="Haptic feedback"
        value={hapticFeedback}
        onValueChange={setHapticFeedback}
      />

      <SectionDivider />

      {/* Log out */}
      <Pressable className="active:bg-muted flex-row items-center gap-4 px-5 py-3.5">
        <Icon icon={LogOut} className="text-foreground h-5 w-5" />
        <Text className="text-foreground text-[17px]">Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

function SectionDivider() {
  return <View className="bg-border mx-5 h-px" />;
}

function SettingsRow({
  icon,
  label,
  detail,
  href,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  href?: string;
}) {
  const content = (
    <View className="active:bg-muted flex-row items-center gap-4 px-5 py-3.5">
      <Icon icon={icon} className="text-foreground h-5 w-5" />
      <Text className="text-foreground flex-1 text-[17px]">{label}</Text>
      {detail && <Text className="text-muted-foreground text-[15px]">{detail}</Text>}
      <Icon icon={ChevronRight} className="text-muted-foreground h-3.5 w-3.5" />
    </View>
  );

  if (href) {
    return (
      // expo-router types `href` as a known-route union; this one is dynamic.
      // eslint-disable-next-line typescript/no-unsafe-type-assertion
      <Link href={href as unknown as Parameters<typeof Link>["0"]["href"]} asChild>
        <Pressable>{content}</Pressable>
      </Link>
    );
  }

  return <Pressable>{content}</Pressable>;
}

function SettingsToggleRow({
  icon,
  label,
  value,
  onValueChange,
}: {
  icon: LucideIcon;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-4 px-5 py-3">
      <Icon icon={icon} className="text-foreground h-5 w-5" />
      <Text className="text-foreground flex-1 text-[17px]">{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
