import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Response } from "./Response";
import { Reasoning } from "./Reasoning";
import { MessageActions } from "./MessageActions";

type MessageProps = {
  role: "user" | "assistant";
  text: string;
  reasoning?: string;
  streaming?: boolean;
  onRetry?: () => void;
  /** Slots rendered between reasoning and text — e.g. tool cards, artifact card. */
  children?: ReactNode;
};

export function Message({ role, text, reasoning, streaming, onRetry, children }: MessageProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-[14px_14px_4px_14px] border border-[var(--border-soft)] bg-[var(--bg-soft)] px-4 py-3 text-[14.5px] leading-snug text-[var(--ink)]">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <div className="mt-px grid h-7 w-7 flex-none place-items-center rounded-lg bg-[var(--page-color,var(--accent))] text-sm text-white">
        ✦
      </div>
      <div className="min-w-0 flex-1">
        {reasoning && <Reasoning text={reasoning} />}
        {children}
        {text.trim() && (
          <div className={cn("text-[14.5px] leading-relaxed text-[var(--ink-soft)]")}>
            <Response text={text} />
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-[var(--page-color,var(--accent))]" />
            )}
          </div>
        )}
        {!streaming && text.trim() && <MessageActions text={text} onRetry={onRetry} />}
      </div>
    </div>
  );
}
