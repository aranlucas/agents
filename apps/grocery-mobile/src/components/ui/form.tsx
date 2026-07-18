import React from "react";
import { View } from "react-native";
import {
  Controller,
  FormProvider,
  useController,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";
import { Input, type InputProps } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Form = FormProvider;

export function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return <Controller {...props} />;
}

export interface FormItemProps extends React.ComponentPropsWithoutRef<typeof View> {
  className?: string;
}

export function FormItem({ className, ...props }: FormItemProps) {
  return <View className={cn("gap-1.5", className)} {...props} />;
}

export function FormMessage({ className, message }: { className?: string; message?: string }) {
  if (!message) return null;
  return (
    <Text
      accessibilityRole="alert"
      className={cn("text-destructive", className)}
      selectable
      variant="small"
    >
      {message}
    </Text>
  );
}

type SharedFieldProps = {
  containerClassName?: string;
  description?: string;
  label?: string;
};

export type FormInputProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> &
  Omit<
    InputProps,
    "defaultValue" | "disabled" | "name" | "onBlur" | "onChange" | "onChangeText" | "value"
  > &
  SharedFieldProps;

export function FormInput<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  className,
  containerClassName,
  control,
  defaultValue,
  description,
  disabled,
  label,
  name,
  rules,
  shouldUnregister,
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  ...props
}: FormInputProps<TFieldValues, TName>) {
  const labelId = React.useId();
  const { field, fieldState, formState } = useController({
    control,
    defaultValue,
    disabled,
    name,
    rules,
    shouldUnregister,
  });
  const error = fieldState.error?.message;
  const showError = Boolean(error) && (fieldState.isTouched || formState.isSubmitted);

  return (
    <FormItem className={containerClassName}>
      {label ? (
        <Label className="mb-0" nativeID={labelId}>
          {label}
        </Label>
      ) : null}
      <Input
        ref={field.ref}
        {...props}
        accessibilityHint={showError ? error : accessibilityHint}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityLabelledBy={label ? labelId : undefined}
        accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
        aria-invalid={showError || undefined}
        className={cn(showError && "border-destructive", className)}
        editable={disabled ? false : props.editable}
        onBlur={field.onBlur}
        onChangeText={field.onChange}
        value={typeof field.value === "string" ? field.value : String(field.value ?? "")}
      />
      {showError ? (
        <FormMessage message={error} />
      ) : description ? (
        <Text className="text-muted-foreground" selectable variant="small">
          {description}
        </Text>
      ) : null}
    </FormItem>
  );
}

export type FormTextareaProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> &
  Omit<
    TextareaProps,
    "defaultValue" | "disabled" | "name" | "onBlur" | "onChange" | "onChangeText" | "value"
  > &
  SharedFieldProps;

export function FormTextarea<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  className,
  containerClassName,
  control,
  defaultValue,
  description,
  disabled,
  label,
  name,
  rules,
  shouldUnregister,
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  ...props
}: FormTextareaProps<TFieldValues, TName>) {
  const labelId = React.useId();
  const { field, fieldState, formState } = useController({
    control,
    defaultValue,
    disabled,
    name,
    rules,
    shouldUnregister,
  });
  const error = fieldState.error?.message;
  const showError = Boolean(error) && (fieldState.isTouched || formState.isSubmitted);

  return (
    <FormItem className={containerClassName}>
      {label ? (
        <Label className="mb-0" nativeID={labelId}>
          {label}
        </Label>
      ) : null}
      <Textarea
        ref={field.ref}
        {...props}
        accessibilityHint={showError ? error : accessibilityHint}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityLabelledBy={label ? labelId : undefined}
        accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
        aria-invalid={showError || undefined}
        className={cn(showError && "border-destructive", className)}
        editable={disabled ? false : props.editable}
        onBlur={field.onBlur}
        onChangeText={field.onChange}
        value={typeof field.value === "string" ? field.value : String(field.value ?? "")}
      />
      {showError ? (
        <FormMessage message={error} />
      ) : description ? (
        <Text className="text-muted-foreground" selectable variant="small">
          {description}
        </Text>
      ) : null}
    </FormItem>
  );
}
