import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, MessageSquareText } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useGroceryAgent } from "@/components/grocery-agent-provider";
import { InlineError, SecondaryButton } from "@/components/ui";
import { colors } from "@/lib/theme";

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

  const returnToChat = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  useFocusEffect(
    useCallback(() => {
      refetchThreads();
    }, [refetchThreads]),
  );

  const resume = async (threadId: string) => {
    clearError();
    setOpening(threadId);
    if (await openThread(threadId)) returnToChat();
    setOpening("");
  };

  if (threadsLoading && threads.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.green} />
        <Text style={styles.loadingText}>Loading your chats…</Text>
      </View>
    );
  }

  if (threadsError && threads.length === 0) {
    return (
      <View style={styles.centered}>
        <InlineError message="Your chat history could not be loaded." />
        <SecondaryButton onPress={refetchThreads}>Try again</SecondaryButton>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, threads.length === 0 && styles.emptyContent]}
      data={threads}
      keyExtractor={(thread) => thread.id}
      onEndReached={() => {
        if (hasMoreThreads && !isFetchingMoreThreads) fetchMoreThreads();
      }}
      onEndReachedThreshold={0.35}
      onRefresh={refetchThreads}
      refreshing={threadsLoading}
      ItemSeparatorComponent={() => <View style={styles.divider} />}
      renderItem={({ item: thread }) => {
        const selected = thread.id === activeThreadId;
        return (
          <Pressable
            accessibilityLabel={`Open ${thread.name || "grocery chat"}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: opening !== "", selected }}
            disabled={opening !== ""}
            onPress={() => void resume(thread.id)}
            style={({ pressed }) => [
              styles.row,
              selected && styles.rowSelected,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.rowIcon}>
              {opening === thread.id ? (
                <ActivityIndicator color={colors.green} />
              ) : (
                <MessageSquareText color={colors.forest} size={21} />
              )}
            </View>
            <View style={styles.rowCopy}>
              <Text numberOfLines={1} style={styles.rowTitle}>
                {thread.name || "Grocery chat"}
              </Text>
              <Text style={styles.rowMeta}>
                {activityLabel(thread.lastRunAt || thread.updatedAt)}
                {selected ? " · Current" : ""}
              </Text>
            </View>
            <ChevronRight color={colors.muted} size={20} />
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MessageSquareText color={colors.green} size={31} />
          </View>
          <Text selectable style={styles.emptyTitle}>
            No previous chats
          </Text>
          <Text selectable style={styles.emptyText}>
            Your Grocery Agent conversations will appear here after you send a message.
          </Text>
          <SecondaryButton onPress={returnToChat}>Start a chat</SecondaryButton>
        </View>
      }
      ListFooterComponent={
        replayError || threadsError || fetchMoreThreadsError || isFetchingMoreThreads ? (
          <View style={styles.footer}>
            {replayError ? <InlineError message={replayError} /> : null}
            {threadsError && threads.length > 0 ? (
              <InlineError message="Your chats could not be refreshed." />
            ) : null}
            {fetchMoreThreadsError ? (
              <>
                <InlineError message="More chats could not be loaded." />
                <SecondaryButton onPress={fetchMoreThreads}>Try again</SecondaryButton>
              </>
            ) : null}
            {isFetchingMoreThreads ? <ActivityIndicator color={colors.green} /> : null}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    margin: 18,
    overflow: "hidden",
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  emptyContent: { flexGrow: 1, borderWidth: 0, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 28,
    backgroundColor: colors.background,
  },
  loadingText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  row: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  rowSelected: { backgroundColor: colors.surfaceMuted },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: "700" },
  rowMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, marginLeft: 69, backgroundColor: colors.line },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    marginBottom: 4,
  },
  emptyTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: "800" },
  emptyText: {
    maxWidth: 330,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 8,
  },
  footer: { alignItems: "center", gap: 10, padding: 14 },
});
