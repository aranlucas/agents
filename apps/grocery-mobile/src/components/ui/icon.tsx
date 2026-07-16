import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { LucideIcon, LucideProps } from "lucide-react-native";
import * as React from "react";
import { useResolveClassNames } from "uniwind";

type IconProps = LucideProps & {
  as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

/**
 * A wrapper component for Lucide icons with Uniwind `className` support.
 *
 * This component allows you to render any Lucide icon while applying utility classes
 * using `uniwind`. It avoids the need to wrap or configure each icon individually.
 *
 * @component
 * @example
 * ```tsx
 * import { ArrowRight } from 'lucide-react-native';
 * import { Icon } from '@/registry/components/ui/icon';
 *
 * <Icon as={ArrowRight} className="text-red-500" size={16} />
 * ```
 *
 * @param {LucideIcon} as - The Lucide icon component to render.
 * @param {string} className - Utility classes to style the icon using Uniwind.
 * @param {number} size - Icon size (defaults to 14).
 * @param {...LucideProps} ...props - Additional Lucide icon props passed to the "as" icon.
 */
function Icon({ as: IconComponent, className, size, ...props }: IconProps) {
  const textClass = React.useContext(TextClassContext);
  const styles = useResolveClassNames(cn("text-foreground", textClass, className));
  const classSize = typeof styles.width === "number" ? styles.width : undefined;

  return (
    <IconComponent
      color={styles.color as LucideProps["color"]}
      size={size ?? classSize ?? 14}
      {...props}
    />
  );
}

export { Icon };
