import { type Thread } from "@copilotkit/react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, MessageSquareText } from "lucide-react-native";
import { memo, useCallback, useRef, useState } from "react";
import { FlatList, Pressable, View, type ListRenderItem } from "react-native";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { RefreshControl } from "@/components/ui/refresh-control";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

function activityLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Previous chat";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function HistorySeparator() {
  return <Separator className="ml-16" />;
}

const ChatHistoryRow = memo(function ChatHistoryRow({
  disabled,
  opening,
  onResume,
  selected,
  thread,
}: {
  disabled: boolean;
  opening: boolean;
  onResume: (threadId: string) => Promise<void>;
  selected: boolean;
  thread: Thread;
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${thread.name || "grocery chat"}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      className={cn(
        "min-h-19 flex-row items-center gap-3 px-4 py-3 active:bg-muted",
        selected && "bg-muted",
      )}
      disabled={disabled}
      onPress={() => void onResume(thread.id)}
    >
      <View className="size-11 items-center justify-center rounded-2xl bg-muted">
        {opening ? (
          <Spinner accessibilityLabel="Opening chat" size="sm" />
        ) : (
          <Icon as={MessageSquareText} className="size-5 text-secondary" />
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} variant="large">
          {thread.name || "Grocery chat"}
        </Text>
        <Text variant="muted">
          {activityLabel(thread.lastRunAt || thread.updatedAt)}
          {selected ? " · Current" : ""}
        </Text>
      </View>
      <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
    </Pressable>
  );
});

const ChatHistoryEmpty = memo(function ChatHistoryEmpty({ onStart }: { onStart: () => void }) {
  return (
    <EmptyState
      action={{ label: "Start a chat", onPress: onStart }}
      className="flex-1 p-2"
      description="Your Grocery Agent conversations will appear here after you send a message."
      icon={<Icon as={MessageSquareText} className="size-8 text-primary" />}
      title="No previous chats"
    />
  );
});

export default function ChatHistoryScreen() {
  const router = useRouter();
  const {
    activeThreadId,
    openThread,
    error: replayError,
    clearError,
    threads,
    threadsLoading,
    threadsError,
    fetchMoreThreadsError,
    hasMoreThreads,
    isFetchingMoreThreads,
    refetchThreads,
    fetchMoreThreads,
  } = useGroceryAgent();
  const [opening, setOpening] = useState("");
  const openingRef = useRef("");

  const returnToChat = useCallback(() => {
    router.dismissTo("/chat");
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      refetchThreads();
    }, [refetchThreads]),
  );

  const resume = useCallback(
    async (threadId: string) => {
      if (openingRef.current) return;
      openingRef.current = threadId;
      clearError();
      setOpening(threadId);
      const outcome = await openThread(threadId);
      openingRef.current = "";
      if (outcome.status === "success") returnToChat();
      setOpening("");
    },
    [clearError, openThread, returnToChat],
  );

  const renderItem = useCallback<ListRenderItem<Thread>>(
    ({ item: thread }) => (
      <ChatHistoryRow
        disabled={opening !== ""}
        opening={opening === thread.id}
        onResume={resume}
        selected={thread.id === activeThreadId}
        thread={thread}
      />
    ),
    [activeThreadId, opening, resume],
  );

  const renderEmpty = useCallback(
    () => <ChatHistoryEmpty onStart={returnToChat} />,
    [returnToChat],
  );

  if (threadsLoading && threads.length === 0) {
    return (
      <View
        accessibilityLabel="Loading your chats"
        accessibilityRole="progressbar"
        className="flex-1 gap-3 bg-background p-4.5"
      >
        {[0, 1, 2].map((index) => (
          <Skeleton className="h-20 w-full rounded-2xl" key={index} />
        ))}
      </View>
    );
  }

  if (threadsError && threads.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-7">
        <Alert title="Your chat history could not be loaded." variant="destructive" />
        <Button size="lg" variant="secondary" onPress={refetchThreads}>
          Try again
        </Button>
      </View>
    );
  }

  return (
    <FlatList
      className="w-full max-w-3xl flex-1 self-center bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName={cn(
        "m-4.5 overflow-hidden rounded-3xl border border-border bg-card",
        threads.length === 0 && "flex-grow border-0 bg-background",
      )}
      data={threads}
      keyExtractor={(thread) => thread.id}
      onEndReached={() => {
        if (hasMoreThreads && !isFetchingMoreThreads) fetchMoreThreads();
      }}
      onEndReachedThreshold={0.35}
      refreshControl={<RefreshControl refreshing={threadsLoading} onRefresh={refetchThreads} />}
      ItemSeparatorComponent={HistorySeparator}
      renderItem={renderItem}
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={
        replayError || threadsError || fetchMoreThreadsError || isFetchingMoreThreads ? (
          <View className="items-center gap-2.5 p-3.5">
            {replayError ? <Alert title={replayError} variant="destructive" /> : null}
            {threadsError && threads.length > 0 ? (
              <Alert title="Your chats could not be refreshed." variant="destructive" />
            ) : null}
            {fetchMoreThreadsError ? (
              <>
                <Alert title="More chats could not be loaded." variant="destructive" />
                <Button size="lg" variant="secondary" onPress={fetchMoreThreads}>
                  Try again
                </Button>
              </>
            ) : null}
            {isFetchingMoreThreads ? (
              <Spinner accessibilityLabel="Loading more chats" size="sm" />
            ) : null}
          </View>
        ) : null
      }
    />
  );
}
