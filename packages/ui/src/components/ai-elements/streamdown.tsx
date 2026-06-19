"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown as BaseStreamdown } from "streamdown";

const PLUGINS = { cjk, code, math, mermaid };

export type StreamdownProps = Omit<ComponentProps<typeof BaseStreamdown>, "plugins">;

export function Streamdown(props: StreamdownProps) {
  return <BaseStreamdown plugins={PLUGINS} {...props} />;
}
