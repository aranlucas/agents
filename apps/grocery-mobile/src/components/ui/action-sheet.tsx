import React, { forwardRef, useCallback } from "react";
import { View, Pressable, Text, useColorScheme } from "react-native";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { cn } from "@/lib/utils";

export interface ActionSheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface ActionSheetProps {
  className?: string;
  title?: string;
  actions: ActionSheetAction[];
  onCancel?: () => void;
}

export const ActionSheet = forwardRef<BottomSheetModal, ActionSheetProps>(
  ({ className, title, actions, onCancel }, ref) => {
    const dark = useColorScheme() === "dark";
    const renderBackdrop = useCallback(
      (backdropProps: React.ComponentProps<typeof BottomSheetBackdrop>) => (
        <BottomSheetBackdrop
          {...backdropProps}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: dark ? "#0a0a0a" : "#ffffff" }}
        handleIndicatorStyle={{ backgroundColor: dark ? "#52525b" : "#a1a1aa" }}
      >
        <BottomSheetView>
          <View className={cn("px-4 pb-8", className)}>
            {title && (
              <Text className="py-3 text-center text-sm text-muted-foreground">{title}</Text>
            )}
            {actions.map((action, i) => (
              <Pressable
                key={i}
                className="min-h-12 items-center border-b border-border py-4"
                onPress={action.onPress}
                accessible={true}
                accessibilityRole="button"
              >
                <Text
                  className={cn(
                    "text-base font-medium",
                    action.destructive ? "text-destructive" : "text-foreground",
                  )}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
            {onCancel && (
              <Pressable
                className="mt-2 min-h-12 items-center py-4"
                onPress={onCancel}
                accessible={true}
                accessibilityRole="button"
              >
                <Text className="text-base font-semibold text-muted-foreground">Cancel</Text>
              </Pressable>
            )}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ActionSheet.displayName = "ActionSheet";
