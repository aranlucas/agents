import { useSignIn, useSignUp, useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark, InlineError, PrimaryButton, SecondaryButton } from "@/components/ui";
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
            <Text style={styles.eyebrow}>GROCERY AGENT</Text>
            <Text selectable style={styles.title}>
              Dinner plans, done.
            </Text>
            <Text selectable style={styles.subtitle}>
              Turn a recipe or idea into a practical grocery list. Connect Kroger only when you want
              live products and cart actions.
            </Text>
          </View>
        </View>

        {mode !== "verify" && (
          <SecondaryButton disabled={busy} onPress={authenticateWithGoogle}>
            Continue with Google
          </SecondaryButton>
        )}

        {mode !== "verify" && (
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        <View style={styles.form}>
          {mode !== "verify" ? (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor="#8a928b"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
              />
              <Text style={styles.label}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder="At least 8 characters"
                placeholderTextColor="#8a928b"
                secureTextEntry
                style={styles.input}
                value={password}
                onChangeText={setPassword}
              />
            </>
          ) : (
            <>
              <Text selectable style={styles.verifyCopy}>
                We sent a verification code to {email}.
              </Text>
              <Text style={styles.label}>Verification code</Text>
              <TextInput
                accessibilityLabel="Verification code"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                placeholder="123456"
                placeholderTextColor="#8a928b"
                style={styles.input}
                value={code}
                onChangeText={setCode}
              />
            </>
          )}

          {error ? <InlineError message={error} /> : null}
          <PrimaryButton disabled={!isReady} loading={busy} onPress={submitCredentials}>
            {mode === "sign-in"
              ? "Sign in"
              : mode === "sign-up"
                ? "Create account"
                : "Verify email"}
          </PrimaryButton>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setError("");
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
          style={styles.switcher}
        >
          <Text style={styles.switcherText}>
            {mode === "sign-in"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, gap: 18 },
  hero: { gap: 22, marginBottom: 10 },
  heroCopy: { gap: 8 },
  eyebrow: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.1,
  },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { color: colors.muted, fontSize: 13 },
  form: { gap: 10 },
  label: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 2 },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  verifyCopy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 6 },
  switcher: { alignItems: "center", padding: 10 },
  switcherText: { color: colors.green, fontSize: 14, lineHeight: 20, fontWeight: "700" },
});
