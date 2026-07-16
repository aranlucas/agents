import * as React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type PriceProps = React.ComponentPropsWithoutRef<typeof View> & {
  amount: number;
  currency?: string;
  locale?: string;
  prefix?: string;
  strikethrough?: boolean;
  textClassName?: string;
};

function Price({
  amount,
  className,
  currency = "USD",
  locale = "en-US",
  prefix,
  strikethrough,
  textClassName,
  ...props
}: PriceProps) {
  const formatted = new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);

  return (
    <View className={cn("flex-row items-baseline", className)} {...props}>
      {prefix ? (
        <Text className={cn("me-1 text-sm text-muted-foreground", textClassName)} selectable>
          {prefix}
        </Text>
      ) : null}
      <Text
        className={cn(
          "text-lg font-semibold text-foreground",
          strikethrough && "text-muted-foreground line-through",
          textClassName,
        )}
        selectable
      >
        {formatted}
      </Text>
    </View>
  );
}

export { Price };
export type { PriceProps };
