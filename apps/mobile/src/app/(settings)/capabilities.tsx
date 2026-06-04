import { Icon } from "@/components/icon";
import { Box, Brain, Check, ChevronRight, FileCog, Globe, Search } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";

export default function CapabilitiesScreen() {
  const [artifacts, setArtifacts] = useState(true);
  const [codeExecution, setCodeExecution] = useState(true);
  const [webSearch, setWebSearch] = useState(true);
  const [searchChats, setSearchChats] = useState(true);
  const [generateMemory, setGenerateMemory] = useState(true);

  return (
    <ScrollView
      className="bg-background text-foreground flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="pb-10"
    >
      <CapabilityToggle
        icon={Box}
        label="Artifacts"
        description="Required by code execution"
        value={artifacts}
        onValueChange={setArtifacts}
      />
      <CapabilityToggle
        icon={FileCog}
        label="Code execution and file creation"
        description="Allow Agent to execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports."
        value={codeExecution}
        onValueChange={setCodeExecution}
      />
      <CapabilityToggle
        icon={Globe}
        label="Web search"
        description="Agent will automatically search the web when it determines it needs current information"
        value={webSearch}
        onValueChange={setWebSearch}
      />

      <View className="bg-border mx-5 mt-2 h-px" />

      <SectionHeader title="Memory" />

      <CapabilityToggle
        icon={Search}
        label="Search and reference chats"
        description="Allow Agent to search for relevant details in past chats. Learn more."
        value={searchChats}
        onValueChange={setSearchChats}
      />
      <CapabilityToggle
        icon={Brain}
        label="Generate memory from chat history"
        description="Allow Agent to remember relevant context from your chats. This setting controls memory for both chats and projects. Learn more."
        value={generateMemory}
        onValueChange={setGenerateMemory}
      />

      {/* View your memory card */}
      <View className="bg-muted border-continuous mx-5 mt-4 flex-row items-center rounded-xl px-4 py-3.5">
        <View className="flex-1">
          <Text className="text-foreground text-[15px] font-medium">View your memory</Text>
          <Text className="text-muted-foreground mt-0.5 text-[13px]">
            Updated 4d ago from your chats
          </Text>
        </View>
        <Icon icon={ChevronRight} className="text-muted-foreground h-3.5 w-3.5" />
      </View>

      <View className="bg-border mx-5 mt-6 h-px" />

      <SectionHeader title="Tool access" />

      <ToolAccessOption label="Auto" description="Agent chooses for you" selected />
      <ToolAccessOption
        label="On demand"
        description="Load when needed. More messages, lower accuracy"
      />
      <ToolAccessOption label="Always available" />
    </ScrollView>
  );
}

function ToolAccessOption({
  label,
  description,
  selected,
}: {
  label: string;
  description?: string;
  selected?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-4 px-5 py-3">
      <View className="flex-1">
        <Text className="text-foreground text-[17px]">{label}</Text>
        {description && <Text className="text-muted-foreground text-[13px]">{description}</Text>}
      </View>
      {selected && <Icon icon={Check} className="h-5 w-5 text-blue-500" />}
    </View>
  );
}

function CapabilityToggle({
  icon,
  label,
  description,
  value,
  onValueChange,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-4 px-5 py-3.5">
      <Icon icon={icon} className="text-foreground h-5 w-5" />
      <View className="flex-1 gap-0.5">
        <Text className="text-foreground text-[17px]">{label}</Text>
        {description && (
          <Text className="text-muted-foreground text-[13px] leading-snug">{description}</Text>
        )}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text className="text-foreground px-5 pt-6 pb-2 text-[15px] font-semibold">{title}</Text>;
}
