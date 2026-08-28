"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown as BaseStreamdown } from "streamdown";

import { cn } from "../../lib/utils";

type StreamdownPluginConfig = NonNullable<ComponentProps<typeof BaseStreamdown>["plugins"]>;

// The @streamdown/* plugins type against unified@11 while CopilotKit's
// react-markdown@8 dependency resolves unified@10 types into this package;
// the plugins themselves are runtime-compatible across both.
export const streamdownPlugins = { cjk, code, math, mermaid } as StreamdownPluginConfig;

export type StreamdownProps = Omit<ComponentProps<typeof BaseStreamdown>, "plugins">;

export function Streamdown({ className, ...props }: StreamdownProps) {
  return (
    <BaseStreamdown
      className={cn("typeset typeset-site", className)}
      plugins={streamdownPlugins}
      {...props}
    />
  );
}
