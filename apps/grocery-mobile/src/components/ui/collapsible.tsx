import * as React from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { entering, exiting } from "@/components/ui/animate";
import { cn } from "@/lib/utils";

const CollapsibleContext = React.createContext<{ isOpen: boolean; toggle: () => void }>({
  isOpen: false,
  toggle: () => undefined,
});

type CollapsibleProps = React.ComponentProps<typeof View> & {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

function Collapsible({
  open: controlledOpen,
  onOpenChange,
  className,
  children,
  ...props
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const toggle = React.useCallback(() => {
    const next = !isOpen;
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }, [controlledOpen, isOpen, onOpenChange]);

  return (
    <CollapsibleContext.Provider value={{ isOpen, toggle }}>
      <View className={cn(className)} {...props}>
        {children}
      </View>
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({
  accessibilityState,
  className,
  onPress,
  ...props
}: React.ComponentProps<typeof Pressable>) {
  const { isOpen, toggle } = React.use(CollapsibleContext);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, expanded: isOpen }}
      className={cn(className)}
      onPress={(event) => {
        toggle();
        onPress?.(event);
      }}
      {...props}
    />
  );
}

function CollapsibleContent({ className, children, ...props }: React.ComponentProps<typeof View>) {
  const { isOpen } = React.use(CollapsibleContext);
  if (!isOpen) return null;
  return (
    <Animated.View entering={entering.fadeInDown} exiting={exiting.fadeOutUp}>
      <View className={cn(className)} {...props}>
        {children}
      </View>
    </Animated.View>
  );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
export type { CollapsibleProps };
