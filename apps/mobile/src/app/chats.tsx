import { useDrawer } from "@/components/drawer-content";
import { Icon } from "@/components/icon";
import { Image } from "@/components/tw";
import { MOCK_CHATS, type MockChat } from "@/utils/mock-chats";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Color, Link, Stack, useRouter } from "expo-router";
import { ChevronRight, Menu, Search } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";

type Filter = "all" | "starred";

function formatTimeAgo(daysAgo: number): string {
  if (daysAgo < 7) return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
  const weeks = Math.round(daysAgo / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

type Chat = MockChat;

function ChatRow({
  item,
  onRename,
  onDelete,
  onStar,
}: {
  item: Chat;
  onRename: () => void;
  onDelete: () => void;
  onStar: () => void;
}) {
  return (
    <Link href="/" asChild>
      <Link.Trigger>
        <Pressable className="active:bg-card flex-row items-center px-5 py-4">
          <View className="mr-3 flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-foreground text-[17px]" selectable>
              {item.title}
            </Text>
            <Text className="text-muted-foreground text-[13px]">{formatTimeAgo(item.daysAgo)}</Text>
          </View>
          {process.env.EXPO_OS === "ios" ? (
            <Image
              source="sf:chevron.right"
              className="text-muted-foreground h-4 w-2.5 font-medium"
            />
          ) : (
            <Icon icon={ChevronRight} className="text-muted-foreground h-4 w-2.5" />
          )}
        </Pressable>
      </Link.Trigger>

      <Link.Menu>
        <Link.MenuAction
          title={item.starred ? "Unstar" : "Star"}
          icon={item.starred ? "star.fill" : "star"}
          onPress={onStar}
        />
        <Link.MenuAction title="Rename" icon="pencil" onPress={onRename} />
        <Link.MenuAction title="Delete" icon="trash" destructive onPress={onDelete} />
      </Link.Menu>
    </Link>
  );
}

function EmptySearch({ query }: { query: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 pt-32">
      <Icon icon={Search} className="text-muted-foreground h-10 w-10" />
      <Text className="text-muted-foreground px-10 text-center text-[17px]">
        No results found for &ldquo;{query}&rdquo;
      </Text>
    </View>
  );
}

export default function ChatsScreen() {
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState(MOCK_CHATS);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    let results = chats;
    if (filter === "starred") {
      results = results.filter((c) => c.starred);
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter((c) => c.title.toLowerCase().includes(q));
    }
    return results;
  }, [search, chats, filter]);

  const handleRename = useCallback((chat: Chat) => {
    Alert.prompt(
      "Rename Chat",
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "OK",
          onPress: (newTitle?: string) => {
            if (newTitle?.trim()) {
              setChats((prev) =>
                prev.map((c) => (c.id === chat.id ? { ...c, title: newTitle.trim() } : c)),
              );
            }
          },
        },
      ],
      "plain-text",
      chat.title,
    );
  }, []);

  const handleDelete = useCallback((chat: Chat) => {
    Alert.alert("Delete Chat", `Delete "${chat.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setChats((prev) => prev.filter((c) => c.id !== chat.id));
        },
      },
    ]);
  }, []);

  const handleStar = useCallback((chat: Chat) => {
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, starred: !c.starred } : c)));
  }, []);

  return (
    <>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustContentInsets
        automaticallyAdjustsScrollIndicatorInsets
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="android:pb-safe pb-0"
        renderItem={({ item }) => (
          <ChatRow
            item={item}
            onRename={() => handleRename(item)}
            onDelete={() => handleDelete(item)}
            onStar={() => handleStar(item)}
          />
        )}
        ListEmptyComponent={search ? <EmptySearch query={search} /> : null}
      />

      <Stack.SearchBar
        placeholder="Search"
        hideWhenScrolling={false}
        onChangeText={(e) => setSearch(e.nativeEvent.text)}
        onCancelButtonPress={() => setSearch("")}
      />

      <LeftToolbar />
      <RightToolbar filter={filter} setFilter={setFilter} />
      <BottomToolbar />
    </>
  );
}

function LeftToolbar() {
  const { openDrawer } = useDrawer();

  if (process.env.EXPO_OS === "android") {
    return (
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
    );
  }
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon="list.bullet" onPress={openDrawer} />
    </Stack.Toolbar>
  );
}

function RightToolbar({
  filter,
  setFilter,
}: {
  filter: Filter;
  setFilter: (filter: Filter) => void;
}) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="line.horizontal.3.decrease">
        <Stack.Toolbar.Menu inline>
          <Stack.Toolbar.MenuAction
            icon="bubble.left.and.bubble.right"
            isOn={filter === "all"}
            onPress={() => setFilter("all")}
          >
            All chats
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="star"
            isOn={filter === "starred"}
            onPress={() => setFilter("starred")}
          >
            Starred
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

function BottomToolbar() {
  const router = useRouter();

  return (
    <Stack.Toolbar placement="bottom">
      {isLiquidGlassAvailable() && <Stack.Toolbar.SearchBarSlot separateBackground />}
      <Stack.Toolbar.Button
        tintColor={Color.ios.label}
        icon="square.and.pencil"
        onPress={() => router.navigate("/")}
        separateBackground
      />
    </Stack.Toolbar>
  );
}
