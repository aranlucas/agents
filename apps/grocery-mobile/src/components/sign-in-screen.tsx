import { useSignIn, useSignUp, useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { BrandMark } from "@/components/brand-mark";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyboardView } from "@/components/ui/keyboard-view";
import { Label } from "@/components/ui/label";
import { SafeArea } from "@/components/ui/safe-area";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { readableError } from "@/lib/auth";

WebBrowser.maybeCompleteAuthSession();

type Mode = "sign-in" | "sign-up" | "verify";

export function SignInScreen() {
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authenticateWithGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: Linking.createURL("/"),
      });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
      }
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "sign-in") {
        if (!signInLoaded) return;
        const attempt = await signIn.create({ identifier: email.trim(), password });
        if (attempt.status !== "complete" || !attempt.createdSessionId) {
          throw new Error("Additional verification is required. Try signing in with Google.");
        }
        await setSignInActive({ session: attempt.createdSessionId });
        return;
      }

      if (mode === "sign-up") {
        if (!signUpLoaded) return;
        await signUp.create({ emailAddress: email.trim(), password });
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setMode("verify");
        return;
      }

      if (!signUpLoaded) return;
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status !== "complete" || !attempt.createdSessionId) {
        throw new Error("That code could not be verified. Please try again.");
      }
      await setSignUpActive({ session: attempt.createdSessionId });
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  };

  const isReady =
    mode === "verify" ? code.trim().length > 0 : email.trim().length > 0 && password.length >= 8;

  return (
    <SafeArea>
      <KeyboardView>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="flex-grow justify-center px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 items-center gap-4">
            <BrandMark size="xl" />
            <View className="items-center gap-1">
              <Text className="text-center text-3xl font-bold" selectable variant="h1">
                {mode === "sign-in"
                  ? "Welcome back"
                  : mode === "sign-up"
                    ? "Create your account"
                    : "Check your inbox"}
              </Text>
              <Text className="text-center leading-6 text-muted-foreground" selectable>
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
                <View className="gap-1.5">
                  <Label>Email address</Label>
                  <Input
                    accessibilityLabel="Email address"
                    autoCapitalize="none"
                    autoComplete="email"
                    className="min-h-12 rounded-xl bg-card px-4 text-base"
                    keyboardType="email-address"
                    placeholder="name@example.com"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
                <View className="gap-1.5">
                  <Label>Password</Label>
                  <Input
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    className="min-h-12 rounded-xl bg-card px-4 text-base"
                    placeholder="At least 8 characters"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>
              </>
            ) : (
              <View className="gap-1.5">
                <Label>Verification code</Label>
                <Input
                  accessibilityLabel="Verification code"
                  autoComplete="one-time-code"
                  className="min-h-12 rounded-xl bg-card px-4 text-base"
                  keyboardType="number-pad"
                  placeholder="123456"
                  value={code}
                  onChangeText={setCode}
                />
              </View>
            )}

            {error ? <ErrorAlert message={error} /> : null}
            <Button
              className="mt-2 w-full"
              disabled={!isReady}
              loading={busy}
              size="lg"
              onPress={submitCredentials}
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
                setError("");
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
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
