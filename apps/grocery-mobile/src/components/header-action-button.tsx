import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface HeaderActionButtonProps {
  accessibilityLabel: string;
  icon: LucideIcon;
  onPress: () => void;
  className?: string;
}

export function HeaderActionButton({
  accessibilityLabel,
  icon,
  onPress,
  className,
}: HeaderActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={cn("size-10 items-center justify-center rounded-full active:bg-muted", className)}
      onPress={onPress}
    >
      <Icon as={icon} className="size-5 text-foreground" />
    </Pressable>
  );
}
