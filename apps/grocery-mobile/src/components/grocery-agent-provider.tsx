import { type Thread, useThreads } from "@copilotkit/react-native";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useGroceryAgentController } from "@/hooks/use-grocery-agent";

const AGENT_ID = "grocery";

type GroceryAgentContextValue = ReturnType<typeof useGroceryAgentController> & {
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

  const value = useMemo<GroceryAgentContextValue>(
    () => ({
      ...agentController,
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
