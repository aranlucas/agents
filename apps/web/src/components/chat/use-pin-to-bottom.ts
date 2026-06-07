import { useCallback, useEffect, useRef, useState } from "react";
import { shouldPinToBottom } from "./scroll";

/**
 * Keeps a scroll container pinned to the bottom while new content streams in,
 * unless the user has scrolled up. Returns the ref to attach, the current
 * pinned state (for a "jump to latest" button), a scroll handler, and an
 * imperative scrollToBottom.
 */
export function usePinToBottom(deps: unknown[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setPinned(
      shouldPinToBottom({
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      }),
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (pinned) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, pinned, onScroll, scrollToBottom };
}
