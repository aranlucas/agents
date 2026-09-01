"use client";

import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle, Spinner } from "@agents/ui";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success" };

const telegramWindowSchema = z.object({
  WebApp: z.object({ initData: z.string() }),
});
const authErrorSchema = z.object({ error: z.string() });
const authSuccessSchema = z.object({ token: z.string().min(1) });

function getInitData(): string {
  if (typeof window === "undefined") return "";
  const telegram: unknown = Reflect.get(window, "Telegram");
  const parsed = telegramWindowSchema.safeParse(telegram);
  if (parsed.success && parsed.data.WebApp.initData) return parsed.data.WebApp.initData;
  // Dev fallback: pass ?initData=... in the URL
  return new URLSearchParams(window.location.search).get("initData") ?? "";
}

export default function TmaPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signIn } = useSignIn();
  const clerk = useClerk();
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace("/");
      return;
    }

    async function authenticate() {
      const initData = getInitData();
      if (!initData) {
        setState({ status: "error", message: "Not opened from Telegram." });
        return;
      }

      try {
        const res = await fetch("/api/telegram/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          const parsed = authErrorSchema.safeParse(body);
          setState({
            status: "error",
            message: parsed.success ? parsed.data.error : "Auth failed.",
          });
          return;
        }
        const body: unknown = await res.json();
        const parsed = authSuccessSchema.safeParse(body);
        if (!parsed.success) {
          setState({ status: "error", message: "Auth response was invalid." });
          return;
        }
        const token = parsed.data.token;
        const { error } = await signIn.ticket({ ticket: token });
        if (error) {
          setState({ status: "error", message: error.message ?? "Sign-in failed." });
          return;
        }
        await clerk.setActive({ session: signIn.createdSessionId });
        router.replace("/");
      } catch {
        setState({ status: "error", message: "Unexpected error. Please try again." });
      }
    }

    void authenticate();
  }, [isLoaded, isSignedIn, signIn, clerk, router]);

  if (state.status === "error") {
    return (
      <main
        data-field-grid
        className="flex min-h-screen items-center justify-center bg-muted/30 p-6"
      >
        <Alert className="max-w-md bg-card shadow-card" variant="destructive">
          <AlertTitle>Telegram sign-in stopped</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main data-field-grid className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div
        aria-live="polite"
        className="flex w-full max-w-sm flex-col items-center gap-4 border border-border bg-card p-8 text-center shadow-card"
      >
        <Spinner className="text-primary" />
        <div>
          <p className="font-medium">Signing in with Telegram</p>
          <p className="mt-1 text-sm text-muted-foreground">Connecting your secure session…</p>
        </div>
      </div>
    </main>
  );
}
