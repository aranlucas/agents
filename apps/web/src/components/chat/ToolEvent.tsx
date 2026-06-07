import { cn } from "@/lib/utils";

type ToolStatus = "inProgress" | "executing" | "complete";

export function toolEventLabel(name: string): string {
  const n = name.replace(/[_-]+/g, " ").toLowerCase();
  if (n.includes("approval")) return "Waiting for your approval";
  if (n.includes("itinerary")) return "Updating the itinerary";
  if (n.includes("shopping") || n.includes("cart")) return "Updating the shopping list";
  if (n.includes("meal")) return "Planning meals";
  if (n.includes("flight")) return "Checking travel options";
  if (n.includes("fitness") || n.includes("training") || n.includes("plan")) return "Updating the plan";
  if (n.includes("delegate")) return "Delegating to another agent";
  if (n.includes("surface") || n.includes("a2ui")) return "Rendering an interface";
  return "Agent used a tool";
}

function badge(status: ToolStatus) {
  if (status === "complete") {
    return { text: "done", cls: "bg-[var(--success-soft)] text-[var(--success)]" };
  }
  if (status === "executing") {
    return { text: "running", cls: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" };
  }
  return { text: "drafting", cls: "bg-[var(--bg-soft)] text-[var(--ink-mute)]" };
}

export function ToolEvent({
  name,
  status,
  parameters,
  result,
}: {
  name: string;
  status: ToolStatus;
  parameters?: unknown;
  result?: unknown;
}) {
  const b = badge(status);
  const active = status !== "complete";
  const hasDetails =
    (parameters !== null && typeof parameters === "object" && Object.keys(parameters).length > 0) ||
    (status === "complete" && result !== undefined);
  return (
    <div className="my-3 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)]">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span
          className={cn(
            "h-1.5 w-1.5 flex-none rounded-full",
            active ? "animate-pulse bg-[var(--page-color,var(--accent))]" : "bg-[var(--success)]",
          )}
        />
        <span className="text-[13px] font-semibold text-[var(--ink)]">{toolEventLabel(name)}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase",
            b.cls,
          )}
        >
          {b.text}
        </span>
        <span className="ml-auto font-mono text-[10px] text-[var(--ink-mute)]">{name}</span>
      </div>
      {hasDetails && (
        <details className="border-t border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <summary className="cursor-pointer font-mono text-[10px] text-[var(--ink-mute)]">
            details
          </summary>
          <pre className="mt-1 max-h-44 overflow-auto text-[11px] text-[var(--ink-soft)]">
            {JSON.stringify(
              {
                ...(parameters ? { parameters } : {}),
                ...(result !== undefined ? { result } : {}),
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </div>
  );
}
