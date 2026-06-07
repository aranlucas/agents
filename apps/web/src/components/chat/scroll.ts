export function shouldPinToBottom(args: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  threshold?: number;
}): boolean {
  const { scrollTop, clientHeight, scrollHeight, threshold = 64 } = args;
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}
