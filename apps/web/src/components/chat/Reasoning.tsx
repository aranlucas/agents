export function Reasoning({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <details className="mb-3 inline-block">
      <summary className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--ink-mute)]">
        <span className="text-[var(--page-color,var(--accent))]">✦</span>
        <span>Thought it through</span>
      </summary>
      <div className="mt-2 border-l-2 border-[var(--border)] pl-3 text-[13px] leading-relaxed text-[var(--ink-mute)] italic">
        {text}
      </div>
    </details>
  );
}
