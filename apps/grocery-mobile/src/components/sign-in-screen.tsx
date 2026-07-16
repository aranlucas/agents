import { useSignIn, useSignUp, useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark } from "@/components/ui";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { readableError } from "@/lib/auth";
import { colors } from "@/lib/theme";

WebBrowser.maybeCompleteAuthSession();

type Mode = "sign-in" | "sign-up" | "verify";

export function SignInScreen() {
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 28 },
        ]}
      >
        <View style={styles.hero}>
          <BrandMark size={58} />
          <View style={styles.heroCopy}>
            <Text className="tracking-wider text-primary" variant="small">
              GROCERY AGENT
            </Text>
            <Text className="text-left text-3xl font-extrabold" selectable variant="h1">
              Dinner plans, done.
            </Text>
            <Text className="leading-6 text-muted-foreground" selectable>
              Turn a recipe or idea into a practical grocery list. Connect Kroger only when you want
              live products and cart actions.
            </Text>
          </View>
        </View>

        {mode !== "verify" && (
          <Button disabled={busy} size="lg" variant="secondary" onPress={authenticateWithGoogle}>
            Continue with Google
          </Button>
        )}

        {mode !== "verify" && (
          <View style={styles.divider}>
            <Separator className="flex-1" />
            <Text variant="muted">or use email</Text>
            <Separator className="flex-1" />
          </View>
        )}

        <View style={styles.form}>
          {mode !== "verify" ? (
            <>
              <Label>Email</Label>
              <Input
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                className="min-h-13 rounded-2xl bg-card px-4 text-base"
                keyboardType="email-address"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
              />
              <Label>Password</Label>
              <Input
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                className="min-h-13 rounded-2xl bg-card px-4 text-base"
                placeholder="At least 8 characters"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </>
          ) : (
            <>
              <Text className="mb-1.5 leading-6 text-muted-foreground" selectable>
                We sent a verification code to {email}.
              </Text>
              <Label>Verification code</Label>
              <Input
                accessibilityLabel="Verification code"
                autoComplete="one-time-code"
                className="min-h-13 rounded-2xl bg-card px-4 text-base"
                keyboardType="number-pad"
                placeholder="123456"
                value={code}
                onChangeText={setCode}
              />
            </>
          )}

          {error ? <ErrorAlert message={error} /> : null}
          <Button disabled={!isReady} loading={busy} size="lg" onPress={submitCredentials}>
            {mode === "sign-in"
              ? "Sign in"
              : mode === "sign-up"
                ? "Create account"
                : "Verify email"}
          </Button>
        </View>

        <Button
          className="self-center"
          onPress={() => {
            setError("");
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
          variant="link"
        >
          {mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, gap: 18 },
  hero: { gap: 22, marginBottom: 10 },
  heroCopy: { gap: 8 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  form: { gap: 10 },
});
