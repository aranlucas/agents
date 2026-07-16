import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as React from "react";
import { Pressable, View } from "react-native";
import { useResolveClassNames } from "uniwind";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ActionSheetAction = {
  destructive?: boolean;
  label: string;
  onPress: () => void;
};

type ActionSheetProps = {
  actions: ActionSheetAction[];
  className?: string;
  onCancel?: () => void;
  onDismiss?: () => void;
  title?: string;
};

const ActionSheet = React.forwardRef<BottomSheetModal, ActionSheetProps>(function ActionSheet(
  { actions, className, onCancel, onDismiss, title },
  ref,
) {
  const backgroundColor = useResolveClassNames("bg-card").backgroundColor;
  const indicatorColor = useResolveClassNames("bg-muted-foreground").backgroundColor;
  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor }}
      enableDynamicSizing
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: indicatorColor }}
      onDismiss={onDismiss}
    >
      <BottomSheetView>
        <View className={cn("px-4 pb-8", className)}>
          {title ? (
            <Text className="py-3 text-center text-sm text-muted-foreground">{title}</Text>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              className="min-h-12 items-center justify-center border-b border-border py-4 active:bg-muted"
              onPress={action.onPress}
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
          {onCancel ? (
            <Pressable
              accessibilityRole="button"
              className="mt-2 min-h-12 items-center justify-center py-4 active:bg-muted"
              onPress={onCancel}
            >
              <Text className="text-base font-semibold text-muted-foreground">Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

export { ActionSheet };
export type { ActionSheetAction, ActionSheetProps };
