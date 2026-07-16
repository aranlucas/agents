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
  StyleSheet,
  View,
} from "react-native";
import { ArrowDown } from "lucide-react-native";
import { colors } from "@/lib/theme";

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
      <View style={styles.root}>{children}</View>
    </MessageScrollerContext.Provider>
  );
});

export function MessageScrollerList<Item>({ onScroll, ...props }: FlatListProps<Item>) {
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
      onScroll={handleScroll}
      scrollEventThrottle={32}
      style={[styles.viewport, props.style]}
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
      onPress={() => scrollToLatest()}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <ArrowDown color={colors.ink} size={19} strokeWidth={2.25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: "relative" },
  viewport: { flex: 1 },
  button: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    width: 40,
    height: 40,
    marginLeft: -20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { backgroundColor: colors.surfaceMuted },
});
