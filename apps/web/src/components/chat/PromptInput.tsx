"use client";

import { useRef, type ReactNode } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isRunning: boolean;
  placeholder: string;
  selector?: ReactNode;
  onAttach?: () => void;
};

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isRunning,
  placeholder,
  selector,
  onAttach,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const submit = () => {
    if (!value.trim() || isRunning) return;
    onSubmit();
  };

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-raised)] p-3 shadow-[0_2px_8px_rgb(21_20_15_/_0.04)] focus-within:border-[var(--page-color,var(--accent))] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-40 w-full resize-none bg-transparent text-[14.5px] leading-normal text-[var(--ink)] outline-none placeholder:text-[var(--ink-mute)]"
      />
      <div className="mt-2 flex items-center gap-2">
        {onAttach && (
          <button
            type="button"
            onClick={onAttach}
            aria-label="Attach"
            className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--border-soft)] text-[var(--ink-mute)] hover:text-[var(--ink)]"
          >
            ＋
          </button>
        )}
        {selector}
        {isRunning ? (
          <button
            type="button"
            onClick={onStop}
            className="ml-auto flex h-[30px] items-center gap-2 rounded-lg border border-[var(--danger)] px-3.5 text-[12.5px] font-semibold text-[var(--danger)]"
          >
            <span className="h-2 w-2 rounded-[2px] bg-[var(--danger)]" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            className="ml-auto flex h-[30px] items-center gap-1.5 rounded-lg bg-[var(--page-color,var(--accent))] px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
            disabled={!value.trim()}
          >
            Send ↑
          </button>
        )}
      </div>
    </div>
  );
}
