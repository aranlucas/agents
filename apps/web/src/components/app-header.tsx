import { AgentStatusBar } from "@/components/agent-status-bar";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader() {
  return (
    <header className="border-border sticky top-0 z-30 border-b bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 backdrop-blur md:px-8">
      <div className="mx-auto flex h-12 max-w-370 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="border-border text-primary grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-(--surface-raised) font-mono text-[10px] font-semibold">
            AG
          </div>
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold tracking-tight">Agents</p>
            <p className="text-muted-foreground hidden truncate font-mono text-[10px] tracking-[0.14em] uppercase sm:block">
              ADK planning network
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <AgentStatusBar />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
