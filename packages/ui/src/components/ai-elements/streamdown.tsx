"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown as BaseStreamdown } from "streamdown";

import { cn } from "../../lib/utils";

const PLUGINS = { cjk, code, math, mermaid };

export type StreamdownProps = Omit<ComponentProps<typeof BaseStreamdown>, "plugins">;

export function Streamdown({ className, ...props }: StreamdownProps) {
  return (
    <BaseStreamdown
      className={cn("typeset typeset-site", className)}
      plugins={PLUGINS}
      {...props}
    />
  );
}
