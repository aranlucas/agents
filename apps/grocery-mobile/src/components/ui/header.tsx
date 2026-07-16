import { cva, type VariantProps } from "class-variance-authority";
import { ArrowLeft } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const headerVariants = cva("min-h-14 flex-row items-center px-4", {
  variants: {
    variant: {
      default: "border-b border-border bg-background",
      primary: "bg-primary",
      transparent: "bg-transparent",
    },
  },
  defaultVariants: { variant: "default" },
});

type HeaderProps = React.ComponentProps<typeof View> & VariantProps<typeof headerVariants>;

function Header({ variant, className, ...props }: HeaderProps) {
  return <View className={cn(headerVariants({ variant }), className)} {...props} />;
}

function HeaderLeft({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("mr-3 flex-row items-center", className)} {...props} />;
}

function HeaderTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn("flex-1 text-lg font-semibold text-foreground", className)}
      numberOfLines={1}
      {...props}
    />
  );
}

function HeaderRight({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("ml-3 flex-row items-center gap-2", className)} {...props} />;
}

type HeaderBackButtonProps = React.ComponentProps<typeof Pressable> & {
  label?: React.ReactNode;
};

function HeaderBackButton({ className, label, ...props }: HeaderBackButtonProps) {
  return (
    <Pressable
      accessibilityLabel="Go back"
      accessibilityRole="button"
      className={cn(
        "min-h-12 min-w-12 flex-row items-center justify-center rounded-full active:bg-muted",
        className,
      )}
      {...props}
    >
      {label === undefined ? (
        <Icon as={ArrowLeft} className="size-6 text-foreground" />
      ) : typeof label === "string" || typeof label === "number" ? (
        <Text className="text-lg text-primary">{label}</Text>
      ) : (
        label
      )}
    </Pressable>
  );
}

export { Header, HeaderBackButton, HeaderLeft, HeaderRight, HeaderTitle };
export type { HeaderBackButtonProps, HeaderProps };
