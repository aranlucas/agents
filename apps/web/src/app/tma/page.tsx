"use client";

import { useAuth, useClerk, useSignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getInitData(): string {
  if (typeof window === "undefined") return "";
  const telegram: unknown = Reflect.get(window, "Telegram");
  const webApp = isRecord(telegram) ? telegram.WebApp : undefined;
  const initData = isRecord(webApp) ? webApp.initData : undefined;
  if (typeof initData === "string" && initData) return initData;
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
          setState({
            status: "error",
            message: isRecord(body) && typeof body.error === "string" ? body.error : "Auth failed.",
          });
          return;
        }
        const body: unknown = await res.json();
        if (!isRecord(body) || typeof body.token !== "string" || !body.token) {
          setState({ status: "error", message: "Auth response was invalid." });
          return;
        }
        const token = body.token;
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
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{state.message}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-muted-foreground text-sm">Signing in…</p>
    </main>
  );
}
