import * as React from "react";
import { Modal, Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { entering, exiting } from "@/components/ui/animate";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type AlertDialogProps = {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <Modal
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
      transparent
      visible={open}
    >
      <Animated.View
        className="flex-1 items-center justify-center bg-black/50"
        entering={entering.fadeIn}
        exiting={exiting.fadeOut}
      >
        <Animated.View entering={entering.zoomIn} exiting={exiting.zoomOut}>
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      accessibilityRole="alert"
      className={cn("mx-6 w-full max-w-80 rounded-2xl bg-card p-6 shadow-xl", className)}
      {...props}
    />
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("pb-4", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("text-lg font-semibold text-card-foreground", className)} {...props} />
  );
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("flex-row justify-end gap-3 pt-4", className)} {...props} />;
}

function AlertDialogAction({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Pressable>) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-12 items-center justify-center rounded-xl bg-primary px-4 py-2.5",
        className,
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm font-medium text-primary-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

function AlertDialogCancel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Pressable>) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-12 items-center justify-center rounded-xl border border-input px-4 py-2.5",
        className,
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm font-medium text-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
export type { AlertDialogProps };
