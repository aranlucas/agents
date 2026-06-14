import type { ReactNode } from "react";
import { Fragment, createElement } from "react";
export type LegendListRef = {
  scrollToEnd: (options?: unknown) => void;
};

export function LegendList({
  data,
  renderItem,
  children,
  ...props
}: {
  data?: unknown[];
  renderItem?: (info: { item: unknown; index: number }) => ReactNode;
  children?: ReactNode;
}) {
  return createElement(
    "LegendList",
    props,
    data?.length
      ? data.map((item, index) =>
          createElement(Fragment, { key: index }, renderItem?.({ item, index })),
        )
      : children,
  );
}
