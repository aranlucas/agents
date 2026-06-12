import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@agents/ui";

interface IconLabelProps {
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  iconClassName?: string;
}

export function IconLabel({
  icon: Icon,
  children,
  className,
  iconClassName,
}: IconLabelProps) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Icon className={cn("h-3 w-3 sm:h-4 sm:w-4", iconClassName)} />
      {children}
    </span>
  );
}
