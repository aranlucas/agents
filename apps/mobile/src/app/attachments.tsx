import { AndroidGrabber } from "@/components/grabber";
import { Icon } from "@/components/icon";
import type { LucideIcon } from "lucide-react-native";
import {
  Archive,
  Camera,
  ChevronRight,
  File,
  Globe,
  Image as ImageIcon,
  Paintbrush,
  Sparkles,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";

function AttachmentButton({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <Pressable className="bg-secondary active:bg-muted border-continuous flex-1 items-center gap-2 rounded-xl py-3">
      <Icon icon={icon} className="text-foreground h-6 w-6" />
      <Text className="text-foreground text-[13px]">{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  badge,
  value,
  onValueChange,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3.5 px-5 py-3">
      <Icon icon={icon} className="text-foreground h-5 w-5" />
      <Text className="text-foreground flex-1 text-[17px]">{label}</Text>
      {badge && (
        <View className="bg-muted rounded px-1.5 py-0.5">
          <Text className="text-muted-foreground text-[11px] font-medium">{badge}</Text>
        </View>
      )}
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function DisclosureRow({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="active:bg-muted flex-row items-center gap-3.5 px-5 py-3.5"
    >
      <Icon icon={icon} className="text-foreground h-5 w-5" />
      <Text className="text-foreground flex-1 text-[17px]">{label}</Text>
      <Text className="text-muted-foreground text-[15px]">{detail}</Text>
      <Icon icon={ChevronRight} className="text-muted-foreground h-3 w-3" />
    </Pressable>
  );
}

export default function AddToChatSheet() {
  const [research, setResearch] = useState(false);
  const [webSearch, setWebSearch] = useState(true);

  return (
    <ScrollView className="flex-1" contentInsetAdjustmentBehavior="automatic">
      <AndroidGrabber />
      {/* Attachment buttons */}
      <View className="flex-row gap-3 px-5 pt-2 pb-4">
        <AttachmentButton icon={Camera} label="Camera" />
        <AttachmentButton icon={ImageIcon} label="Photos" />
        <AttachmentButton icon={File} label="Files" />
      </View>

      {/* Toggles */}
      <ToggleRow icon={Sparkles} label="Research" value={research} onValueChange={setResearch} />
      <ToggleRow
        icon={Globe}
        label="Web search"
        badge="Beta"
        value={webSearch}
        onValueChange={setWebSearch}
      />

      {/* Divider */}
      <View className="bg-border mx-5 my-1 h-px" />

      {/* Disclosure rows */}
      <DisclosureRow icon={Archive} label="Add to project" detail="None" />
      <DisclosureRow icon={Paintbrush} label="Choose style" detail="Normal" />
      <DisclosureRow icon={Wrench} label="Tool access" detail="Auto" />
    </ScrollView>
  );
}
