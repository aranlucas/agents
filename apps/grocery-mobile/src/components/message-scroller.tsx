import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ArrowDown } from "lucide-react-native";
import { colors } from "@/lib/theme";

const LIVE_EDGE_THRESHOLD = 48;

type MessageScrollerContextValue = {
  scrollRef: React.RefObject<ScrollView | null>;
  showScrollToLatest: boolean;
  updateLiveEdge: (atLiveEdge: boolean) => void;
  scrollToLatest: () => void;
};

const MessageScrollerContext = createContext<MessageScrollerContextValue | null>(null);

function useMessageScrollerContext() {
  const value = useContext(MessageScrollerContext);
  if (!value) throw new Error("MessageScroller components must be inside MessageScroller");
  return value;
}

export function useMessageScrollerControls() {
  const { scrollToLatest, updateLiveEdge } = useMessageScrollerContext();
  return {
    releaseFollow: () => updateLiveEdge(false),
    scrollToLatest,
  };
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
  const scrollRef = useRef<ScrollView>(null);
  const atLiveEdgeRef = useRef(true);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  const updateLiveEdge = (atLiveEdge: boolean) => {
    if (atLiveEdgeRef.current === atLiveEdge) return;
    atLiveEdgeRef.current = atLiveEdge;
    setShowScrollToLatest(!atLiveEdge);
  };

  const scrollToLatest = (animated = true) => {
    updateLiveEdge(true);
    scrollRef.current?.scrollToEnd({ animated });
  };

  useImperativeHandle(
    ref,
    () => ({
      scrollToStart: (animated = false) => {
        updateLiveEdge(false);
        scrollRef.current?.scrollTo({ y: 0, animated });
      },
      scrollToEnd: scrollToLatest,
    }),
    [],
  );

  useEffect(() => {
    if (!autoScroll || !atLiveEdgeRef.current) return undefined;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, revision]);

  return (
    <MessageScrollerContext.Provider
      value={{ scrollRef, showScrollToLatest, updateLiveEdge, scrollToLatest }}
    >
      <View style={styles.root}>{children}</View>
    </MessageScrollerContext.Provider>
  );
});

export function MessageScrollerViewport({
  children,
  onScroll,
  ...props
}: ComponentProps<typeof ScrollView>) {
  const { scrollRef, updateLiveEdge } = useMessageScrollerContext();
  return (
    <ScrollView
      {...props}
      ref={scrollRef}
      onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        updateLiveEdge(
          contentSize.height - layoutMeasurement.height - contentOffset.y <= LIVE_EDGE_THRESHOLD,
        );
        onScroll?.(event);
      }}
      scrollEventThrottle={32}
      style={[styles.viewport, props.style]}
    >
      {children}
    </ScrollView>
  );
}

export function MessageScrollerContent(props: ComponentProps<typeof View>) {
  return <View {...props} />;
}

export function MessageScrollerItem({
  messageId,
  scrollAnchor = false,
  ...props
}: ComponentProps<typeof View> & { messageId: string; scrollAnchor?: boolean }) {
  return <View {...props} collapsable={!scrollAnchor} nativeID={messageId} />;
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
