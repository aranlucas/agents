import { Icon } from "@/components/icon";
import { useModel } from "@/components/model-context";
import { Link, Stack } from "expo-router";
import { ChevronDown, Glasses, Menu } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useDrawer } from "./drawer-content";

function HeaderTitleMenu() {
  const { models, selectedModel, extendedThinking } = useModel();
  const selected = models.find((m) => m.id === selectedModel);
  const subtitle = extendedThinking ? "Extended" : undefined;

  return (
    <Link href="/model-picker" asChild>
      <Pressable
        accessibilityRole="button"
        className="active:bg-muted flex-col items-center self-center rounded-md px-2 py-1"
      >
        <View className="flex-row items-center gap-1">
          <Text className="text-foreground text-[17px] font-semibold">
            {selected?.label ?? "Model"}
          </Text>
          <Icon icon={ChevronDown} className="text-foreground h-3 w-3" />
        </View>
        {subtitle && <Text className="text-muted-foreground text-[12px]">{subtitle}</Text>}
      </Pressable>
    </Link>
  );
}

export function MainHeader() {
  const { openDrawer } = useDrawer();
  return (
    <>
      <Stack.Screen.Title asChild>
        <HeaderTitleMenu />
      </Stack.Screen.Title>
      <Stack.Toolbar placement="left" asChild>
        <Pressable
          onPress={openDrawer}
          accessibilityLabel="Open drawer"
          accessibilityRole="button"
          className="-ml-1 p-2 active:opacity-60"
        >
          <Icon icon={Menu} className="text-foreground h-6 w-6" />
        </Pressable>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right" asChild>
        <Pressable
          accessibilityLabel="Reader"
          accessibilityRole="button"
          className="-mr-1 p-2 active:opacity-60"
        >
          <Icon icon={Glasses} className="text-foreground h-6 w-6" />
        </Pressable>
      </Stack.Toolbar>
    </>
  );
}
