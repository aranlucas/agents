import React from "react";

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
  renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
  children?: React.ReactNode;
}) {
  return React.createElement(
    "LegendList",
    props,
    data?.length
      ? data.map((item, index) =>
          React.createElement(React.Fragment, { key: index }, renderItem?.({ item, index })),
        )
      : children,
  );
}
