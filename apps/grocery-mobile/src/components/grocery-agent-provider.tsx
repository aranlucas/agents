import {
  type Suggestion,
  type Thread,
  useConfigureSuggestions,
  useSuggestions,
  useThreads,
} from "@copilotkit/react-native";
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import { useGroceryAgentController } from "@/hooks/use-grocery-agent";
import { uniqueSuggestions } from "@/lib/grocery-suggestions";

const AGENT_ID = "grocery";

type GroceryAgentContextValue = ReturnType<typeof useGroceryAgentController> & {
  suggestions: Suggestion[];
  suggestionsLoading: boolean;
  threads: Thread[];
  threadsLoading: boolean;
  threadsError: Error | null;
  fetchMoreThreadsError: Error | null;
  hasMoreThreads: boolean;
  isFetchingMoreThreads: boolean;
  refetchThreads: () => void;
  fetchMoreThreads: () => void;
};

const GroceryAgentContext = createContext<GroceryAgentContextValue | null>(null);

export function GroceryAgentProvider({ children }: { children: ReactNode }) {
  const threadStore = useThreads({ agentId: AGENT_ID, enabled: true, limit: 25 });
  const agentController = useGroceryAgentController(threadStore.refetchThreads);

  useConfigureSuggestions({
    instructions:
      "Generate concise, practical starter prompts for meal planning, grocery lists, store deals, pantry restocking, or healthier substitutions.",
    minSuggestions: 1,
    maxSuggestions: 3,
    providerAgentId: AGENT_ID,
    consumerAgentId: AGENT_ID,
    available: "before-first-message",
  });
  const suggestionStore = useSuggestions({ agentId: AGENT_ID });
  const suggestions = useMemo(
    () => uniqueSuggestions(suggestionStore.suggestions),
    [suggestionStore.suggestions],
  );
  const resetChat = agentController.startNewChat;
  const reloadSuggestions = suggestionStore.reloadSuggestions;

  const startNewChat = useCallback(async () => {
    const started = await resetChat();
    if (started) reloadSuggestions();
    return started;
  }, [reloadSuggestions, resetChat]);

  const value = useMemo<GroceryAgentContextValue>(
    () => ({
      ...agentController,
      startNewChat,
      suggestions,
      suggestionsLoading: suggestionStore.isLoading,
      threads: threadStore.threads,
      threadsLoading: threadStore.isLoading,
      threadsError: threadStore.listError,
      fetchMoreThreadsError: threadStore.fetchMoreError,
      hasMoreThreads: threadStore.hasMoreThreads,
      isFetchingMoreThreads: threadStore.isFetchingMoreThreads,
      refetchThreads: threadStore.refetchThreads,
      fetchMoreThreads: threadStore.fetchMoreThreads,
    }),
    [
      agentController,
      startNewChat,
      suggestions,
      suggestionStore.isLoading,
      threadStore.threads,
      threadStore.isLoading,
      threadStore.listError,
      threadStore.fetchMoreError,
      threadStore.hasMoreThreads,
      threadStore.isFetchingMoreThreads,
      threadStore.refetchThreads,
      threadStore.fetchMoreThreads,
    ],
  );

  return <GroceryAgentContext value={value}>{children}</GroceryAgentContext>;
}

export function useGroceryAgent(): GroceryAgentContextValue {
  const value = useContext(GroceryAgentContext);
  if (!value) throw new Error("useGroceryAgent must be used within GroceryAgentProvider");
  return value;
}
