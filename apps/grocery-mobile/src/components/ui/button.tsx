import { TextClassContext } from "@/components/ui/text";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { ActivityIndicator, Platform, Pressable } from "react-native";

const buttonVariants = cva(
  cn(
    "shrink-0 flex-row items-center justify-center gap-2 rounded-md shadow-none",
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    }),
  ),
  {
    variants: {
      variant: {
        default: cn(
          "bg-primary shadow-sm shadow-black/5 active:bg-primary/90",
          Platform.select({ web: "hover:bg-primary/90" }),
        ),
        destructive: cn(
          "bg-destructive shadow-sm shadow-black/5 active:bg-destructive/90",
          Platform.select({
            web: "hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
          }),
        ),
        outline: cn(
          "border border-border bg-background shadow-sm shadow-black/5 active:bg-accent dark:border-input dark:bg-input/30 dark:active:bg-input/50",
          Platform.select({
            web: "hover:bg-accent dark:hover:bg-input/50",
          }),
        ),
        secondary: cn(
          "bg-secondary shadow-sm shadow-black/5 active:bg-secondary/80",
          Platform.select({ web: "hover:bg-secondary/80" }),
        ),
        ghost: cn(
          "active:bg-accent dark:active:bg-accent/50",
          Platform.select({ web: "hover:bg-accent dark:hover:bg-accent/50" }),
        ),
        link: "",
      },
      size: {
        default: cn("h-10 px-4 py-2 sm:h-9", Platform.select({ web: "has-[>svg]:px-3" })),
        sm: cn("h-9 gap-1.5 rounded-md px-3 sm:h-8", Platform.select({ web: "has-[>svg]:px-2.5" })),
        lg: cn("min-h-13 rounded-2xl px-6 py-3", Platform.select({ web: "has-[>svg]:px-4" })),
        icon: "size-10 sm:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
    compoundVariants: [{ variant: "secondary", size: "lg", className: "min-h-12" }],
  },
);

const buttonTextVariants = cva(
  cn(
    "text-sm font-medium text-foreground",
    Platform.select({ web: "pointer-events-none transition-colors" }),
  ),
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        destructive: "text-destructive-foreground",
        outline: "",
        secondary: "text-secondary-foreground",
        ghost: "",
        link: cn("text-primary", Platform.select({ web: "underline-offset-4 hover:underline" })),
      },
      size: {
        default: "",
        sm: "",
        lg: "",
        icon: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonIndicatorVariants = cva("accent-foreground", {
  variants: {
    variant: {
      default: "accent-primary-foreground",
      destructive: "accent-destructive-foreground",
      outline: "accent-foreground",
      secondary: "accent-secondary-foreground",
      ghost: "accent-foreground",
      link: "accent-primary",
    },
  },
  defaultVariants: { variant: "default" },
});

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  };

function textFromChildren(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return "";
      return textFromChildren(child.props.children);
    })
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function Button({ children, className, loading = false, variant, size, ...props }: ButtonProps) {
  const disabled = Boolean(props.disabled) || loading;
  const derivedLabel = typeof children === "function" ? "" : textFromChildren(children);
  const idleLabel = React.useRef(derivedLabel);
  React.useEffect(() => {
    if (!loading && derivedLabel) {
      idleLabel.current = derivedLabel;
    }
  }, [derivedLabel, loading]);
  const accessibilityLabel =
    props.accessibilityLabel ??
    (loading ? idleLabel.current || derivedLabel || undefined : undefined);
  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text>{children}</Text>
    ) : (
      children
    );

  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(disabled && "opacity-50", buttonVariants({ variant, size }), className)}
        {...props}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ ...props.accessibilityState, busy: loading, disabled }}
        disabled={disabled}
        role="button"
      >
        {loading ? (
          <ActivityIndicator colorClassName={buttonIndicatorVariants({ variant })} />
        ) : (
          content
        )}
      </Pressable>
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
