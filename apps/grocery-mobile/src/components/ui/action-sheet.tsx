import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as React from "react";
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Platform,
  Pressable,
  View,
} from "react-native";
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
  forwardedRef,
) {
  const modalRef = React.useRef<BottomSheetModal>(null);
  const firstActionRef = React.useRef<React.ElementRef<typeof Pressable>>(null);
  const [presented, setPresented] = React.useState(false);
  const backgroundColor = useResolveClassNames("bg-card").backgroundColor;
  const indicatorColor = useResolveClassNames("bg-muted-foreground").backgroundColor;

  React.useImperativeHandle(forwardedRef, () => modalRef.current as BottomSheetModal);

  React.useEffect(() => {
    if (!presented || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      modalRef.current?.dismiss();
      return true;
    });
    return subscription.remove;
  }, [presented]);

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

  const focusFirstAction = React.useCallback(() => {
    if (Platform.OS === "web") {
      firstActionRef.current?.focus();
      return;
    }
    const handle = findNodeHandle(firstActionRef.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, []);

  return (
    <BottomSheetModal
      ref={modalRef}
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor }}
      enableDynamicSizing
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: indicatorColor }}
      onChange={(index) => {
        const nextPresented = index >= 0;
        setPresented(nextPresented);
        if (nextPresented) requestAnimationFrame(focusFirstAction);
      }}
      onDismiss={() => {
        setPresented(false);
        onDismiss?.();
      }}
    >
      <BottomSheetView role="alertdialog" accessibilityViewIsModal>
        <View className={cn("px-4 pb-8", className)}>
          {title ? (
            <Text className="py-3 text-center text-sm text-muted-foreground">{title}</Text>
          ) : null}
          {actions.map((action, index) => (
            <Pressable
              ref={index === 0 ? firstActionRef : undefined}
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
