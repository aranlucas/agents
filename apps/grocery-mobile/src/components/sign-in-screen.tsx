import { useSignIn, useSignUp, useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useForm, useWatch } from "react-hook-form";
import { BrandMark } from "@/components/brand-mark";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form";
import { KeyboardView } from "@/components/ui/keyboard-view";
import { SafeArea } from "@/components/ui/safe-area";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { readableError } from "@/lib/auth";

WebBrowser.maybeCompleteAuthSession();

type Mode = "sign-in" | "sign-up" | "verify";
type AuthFormValues = { email: string; password: string; code: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function SignInScreen() {
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [oauthBusy, setOauthBusy] = useState(false);
  const {
    clearErrors,
    control,
    getValues,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = useForm<AuthFormValues>({
    defaultValues: { code: "", email: "", password: "" },
    mode: "onChange",
  });
  const email = useWatch({ control, name: "email" });
  const busy = oauthBusy || isSubmitting;

  const authenticateWithGoogle = async () => {
    setOauthBusy(true);
    clearErrors("root");
    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: Linking.createURL("/"),
      });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
      }
    } catch (caught) {
      setError("root.server", { message: readableError(caught) });
    } finally {
      setOauthBusy(false);
    }
  };

  const submitCredentials = handleSubmit(async (values) => {
    clearErrors("root");
    try {
      if (mode === "sign-in") {
        if (!signInLoaded) return;
        const attempt = await signIn.create({
          identifier: values.email.trim(),
          password: values.password,
        });
        if (attempt.status !== "complete" || !attempt.createdSessionId) {
          throw new Error("Additional verification is required. Try signing in with Google.");
        }
        await setSignInActive({ session: attempt.createdSessionId });
        return;
      }

      if (mode === "sign-up") {
        if (!signUpLoaded) return;
        await signUp.create({ emailAddress: values.email.trim(), password: values.password });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        clearErrors();
        setMode("verify");
        return;
      }

      if (!signUpLoaded) return;
      const attempt = await signUp.attemptEmailAddressVerification({ code: values.code.trim() });
      if (attempt.status !== "complete" || !attempt.createdSessionId) {
        throw new Error("That code could not be verified. Please try again.");
      }
      await setSignUpActive({ session: attempt.createdSessionId });
    } catch (caught) {
      setError("root.server", { message: readableError(caught) });
    }
  });

  const isReady = isValid && (mode === "sign-in" ? signInLoaded : signUpLoaded);

  return (
    <SafeArea>
      <KeyboardView>
        <ScrollView
          className="w-full max-w-md self-center"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="flex-grow justify-center px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 items-center gap-4">
            <BrandMark size="xl" />
            <View className="items-center gap-1">
              <Text className="text-center" selectable variant="h2">
                {mode === "sign-in"
                  ? "Welcome back"
                  : mode === "sign-up"
                    ? "Create your account"
                    : "Check your inbox"}
              </Text>
              <Text className="text-center text-muted-foreground" selectable>
                {mode === "sign-in"
                  ? "Sign in to continue planning your groceries."
                  : mode === "sign-up"
                    ? "Create an account to save plans and grocery lists."
                    : `Enter the verification code sent to ${email}.`}
              </Text>
            </View>
          </View>

          <View className="gap-4">
            {mode !== "verify" ? (
              <>
                <FormInput
                  control={control}
                  label="Email address"
                  name="email"
                  rules={{
                    pattern: { message: "Enter a valid email address.", value: EMAIL_PATTERN },
                    required: "Enter your email address.",
                  }}
                  autoCapitalize="none"
                  autoComplete="email"
                  className="rounded-xl bg-card"
                  keyboardType="email-address"
                  placeholder="name@example.com"
                  returnKeyType="next"
                />
                <FormInput
                  control={control}
                  label="Password"
                  name="password"
                  rules={{
                    minLength: { message: "Use at least 8 characters.", value: 8 },
                    required: "Enter your password.",
                  }}
                  autoCapitalize="none"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  className="rounded-xl bg-card"
                  onSubmitEditing={() => void submitCredentials()}
                  placeholder="At least 8 characters"
                  returnKeyType="done"
                  secureTextEntry
                />
              </>
            ) : (
              <FormInput
                control={control}
                label="Verification code"
                name="code"
                rules={{
                  minLength: { message: "Enter the six-digit code.", value: 6 },
                  required: "Enter the verification code.",
                }}
                autoComplete="one-time-code"
                className="rounded-xl bg-card"
                keyboardType="number-pad"
                maxLength={6}
                onSubmitEditing={() => void submitCredentials()}
                placeholder="123456"
                returnKeyType="done"
              />
            )}

            {errors.root?.server?.message ? (
              <Alert title={errors.root.server.message} variant="destructive" />
            ) : null}
            <Button
              className="mt-2 w-full"
              disabled={!isReady}
              loading={busy}
              size="lg"
              onPress={() => void submitCredentials()}
            >
              {mode === "sign-in"
                ? "Sign in"
                : mode === "sign-up"
                  ? "Create account"
                  : "Verify email"}
            </Button>
          </View>

          {mode !== "verify" ? (
            <>
              <View className="my-6 flex-row items-center gap-3">
                <Separator className="flex-1" />
                <Text className="text-muted-foreground" variant="small">
                  or continue with
                </Text>
                <Separator className="flex-1" />
              </View>
              <Button
                className="w-full"
                disabled={busy}
                size="lg"
                variant="outline"
                onPress={authenticateWithGoogle}
              >
                Continue with Google
              </Button>
            </>
          ) : null}

          <View className="mt-8 flex-row items-center justify-center gap-1">
            <Text className="text-muted-foreground" variant="small">
              {mode === "sign-in" ? "Don’t have an account?" : "Already have an account?"}
            </Text>
            <Button
              className="h-auto p-0"
              onPress={() => {
                const nextMode = mode === "sign-in" ? "sign-up" : "sign-in";
                reset({ code: "", email: getValues("email"), password: "" });
                setMode(nextMode);
              }}
              variant="link"
            >
              {mode === "sign-in" ? "Sign up" : "Sign in"}
            </Button>
          </View>
        </ScrollView>
      </KeyboardView>
    </SafeArea>
  );
}
