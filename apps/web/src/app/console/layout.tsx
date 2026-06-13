import { type ReactNode } from "react";

// Shared boundary for the multi-agent console. Each agent owns an explicit
// route folder under `/console/<agent>` so it can customize its experience
// (see `<AgentWorkspace>` for the default), while everything common lives here.
// Cross-agent chrome and providers that should persist across agent/thread
// navigation belong in this layout.
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return children;
}
