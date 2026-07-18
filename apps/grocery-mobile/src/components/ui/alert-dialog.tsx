import React from "react";
import { View, Pressable, Text, Modal } from "react-native";
import Animated from "react-native-reanimated";
import { entering, exiting } from "@/components/ui/animate";
import { cn } from "@/lib/utils";

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
    >
      <Animated.View
        entering={entering.fadeIn}
        exiting={exiting.fadeOut}
        className="flex-1 items-center justify-center bg-black/50"
      >
        <Animated.View
          accessibilityViewIsModal
          className="w-full items-center px-6"
          entering={entering.zoomIn}
          exiting={exiting.zoomOut}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof View> & {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <View
      accessibilityRole="alert"
      accessible
      className={cn("w-full max-w-sm rounded-lg bg-card p-6 shadow-xl", className)}
      {...props}
    >
      {children}
    </View>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof View> & { className?: string }) {
  return <View className={cn("pb-4", className)} {...props} />;
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & { className?: string }) {
  return (
    <Text className={cn("text-lg font-semibold text-card-foreground", className)} {...props} />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Text> & { className?: string }) {
  return <Text className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />;
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof View> & { className?: string }) {
  return (
    <View
      className={cn("flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Pressable> & {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      className={cn(
        "min-h-14 items-center justify-center rounded-md bg-primary px-4 py-2.5",
        className,
      )}
      accessible={true}
      accessibilityRole="button"
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

export function AlertDialogCancel({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Pressable> & {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      className={cn(
        "min-h-14 items-center justify-center rounded-md border border-input px-4 py-2.5",
        className,
      )}
      accessible={true}
      accessibilityRole="button"
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
