import {
  useCallback,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  FlatList,
  type FlatListProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";
import { ArrowDown } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const LIVE_EDGE_THRESHOLD = 48;

type MessageScrollerContextValue = {
  scrollRef: React.RefObject<FlatList<unknown> | null>;
  showScrollToLatest: boolean;
  updateLiveEdge: (atLiveEdge: boolean) => void;
  scrollToLatest: (animated?: boolean) => void;
};

const MessageScrollerContext = createContext<MessageScrollerContextValue | null>(null);

function useMessageScrollerContext() {
  const value = useContext(MessageScrollerContext);
  if (!value) throw new Error("MessageScroller components must be inside MessageScroller");
  return value;
}

export function useMessageScrollerControls() {
  const { scrollToLatest, updateLiveEdge } = useMessageScrollerContext();
  return useMemo(
    () => ({
      releaseFollow: () => updateLiveEdge(false),
      scrollToLatest,
    }),
    [scrollToLatest, updateLiveEdge],
  );
}

export type MessageScrollerHandle = {
  scrollToStart: (animated?: boolean) => void;
  scrollToEnd: (animated?: boolean) => void;
};

export const MessageScroller = forwardRef<
  MessageScrollerHandle,
  {
    autoScroll?: boolean;
    children: ReactNode;
    revision: string | number;
  }
>(function MessageScroller({ autoScroll = false, children, revision }, ref) {
  const scrollRef = useRef<FlatList<unknown>>(null);
  const atLiveEdgeRef = useRef(true);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  const updateLiveEdge = useCallback((atLiveEdge: boolean) => {
    if (atLiveEdgeRef.current === atLiveEdge) return;
    atLiveEdgeRef.current = atLiveEdge;
    setShowScrollToLatest(!atLiveEdge);
  }, []);

  const scrollToLatest = useCallback(
    (animated = true) => {
      updateLiveEdge(true);
      scrollRef.current?.scrollToEnd({ animated });
    },
    [updateLiveEdge],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToStart: (animated = false) => {
        updateLiveEdge(false);
        scrollRef.current?.scrollToOffset({ offset: 0, animated });
      },
      scrollToEnd: scrollToLatest,
    }),
    [scrollToLatest, updateLiveEdge],
  );

  useEffect(() => {
    if (!autoScroll || !atLiveEdgeRef.current) return undefined;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, revision]);

  const value = useMemo(
    () => ({ scrollRef, showScrollToLatest, updateLiveEdge, scrollToLatest }),
    [scrollToLatest, showScrollToLatest, updateLiveEdge],
  );

  return (
    <MessageScrollerContext.Provider value={value}>
      <View className="relative flex-1">{children}</View>
    </MessageScrollerContext.Provider>
  );
});

export function MessageScrollerList<Item>({ className, onScroll, ...props }: FlatListProps<Item>) {
  const { scrollRef, updateLiveEdge } = useMessageScrollerContext();
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      updateLiveEdge(
        contentSize.height - layoutMeasurement.height - contentOffset.y <= LIVE_EDGE_THRESHOLD,
      );
      onScroll?.(event);
    },
    [onScroll, updateLiveEdge],
  );

  return (
    <FlatList
      {...props}
      ref={scrollRef as RefObject<FlatList<Item> | null>}
      className={cn("flex-1", className)}
      onScroll={handleScroll}
      scrollEventThrottle={32}
    />
  );
}

export function MessageScrollerButton() {
  const { scrollToLatest, showScrollToLatest } = useMessageScrollerContext();
  if (!showScrollToLatest) return null;
  return (
    <Pressable
      accessibilityLabel="Scroll to latest message"
      accessibilityRole="button"
      className="absolute bottom-3 left-1/2 -ml-5 size-10 items-center justify-center rounded-full border border-border bg-card active:bg-muted"
      onPress={() => scrollToLatest()}
    >
      <Icon as={ArrowDown} className="size-5 text-foreground" strokeWidth={2.25} />
    </Pressable>
  );
}
