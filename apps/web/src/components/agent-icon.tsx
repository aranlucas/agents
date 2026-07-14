import type { AgentId } from "@agents/types";
import { cn } from "@agents/ui/lib/utils";
import {
  Dumbbell,
  FileUser,
  HeartPulse,
  Plane,
  Presentation,
  ReceiptText,
  ShoppingBasket,
  Stethoscope,
  Table2,
  Telescope,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

const agentIcons = {
  travel: Plane,
  grocery: ShoppingBasket,
  fitness: Dumbbell,
  wellness: HeartPulse,
  expense: ReceiptText,
  "oral-boards": Stethoscope,
  trends: TrendingUp,
  resume: FileUser,
  research: Telescope,
  spreadsheet: Table2,
  presentation: Presentation,
} satisfies Record<AgentId, LucideIcon>;

export function AgentIcon({ agentId, className }: { agentId: AgentId; className?: string }) {
  const Icon = agentIcons[agentId];

  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4", className)}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
    />
  );
}
