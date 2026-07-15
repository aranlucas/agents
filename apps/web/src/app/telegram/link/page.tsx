import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

async function consumeTelegramLink(token: string, clerkUserId: string) {
  const linkSecret = env.TELEGRAM_LINK_SECRET;
  if (!linkSecret) {
    return {
      ok: false,
      message: "Telegram linking is not configured.",
    };
  }

  const response = await fetch(`${agentBaseUrl(env.AGENTS_BASE_URL)}/telegram/link/consume`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-link-secret": linkSecret,
    },
    body: JSON.stringify({ token, clerk_user_id: clerkUserId }),
    cache: "no-store",
  });

  if (response.ok) {
    return { ok: true, message: "Telegram is linked to your account." };
  }

  const errorText = await response.text().catch(() => "");
  return {
    ok: false,
    message: errorText || "The Telegram link is invalid or expired.",
  };
}

export default async function TelegramLinkPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const { userId } = await auth();
  if (!userId) return <TelegramLinkResult ok={false} message="Sign in before linking Telegram." />;

  if (!token) {
    return <TelegramLinkResult ok={false} message="Missing Telegram link token." />;
  }
  const result = await consumeTelegramLink(token, userId);
  return <TelegramLinkResult ok={result.ok} message={result.message} />;
}

function TelegramLinkResult({ ok, message }: { ok: boolean; message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <div className="typeset typeset-site">
        <p className="text-sm font-medium text-muted-foreground">Telegram</p>
        <h1>{ok ? "Account linked" : "Link failed"}</h1>
        <p className="text-muted-foreground">{message}</p>
        <p>
          <Link href="/console/settings">Manage connected accounts</Link>
        </p>
      </div>
    </main>
  );
}
