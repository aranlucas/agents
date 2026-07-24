import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Framing shared by /sign-in and /sign-up so the Clerk card arrives inside the
 * site rather than floating on an empty page. `max-w-100` matches Clerk's own
 * 25rem card so both columns share a left edge.
 *
 * The `data-auth-shell` hook lets globals.css drop Clerk's own card header, which
 * otherwise repeats the heading below. Scoping it here rather than on the
 * provider keeps UserProfile's heading intact in settings.
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      data-auth-shell
      className="mx-auto flex min-h-screen w-full max-w-100 flex-col justify-center gap-6 px-5 py-14"
    >
      <div className="flex flex-col gap-3">
        <Link
          className="w-fit rounded-sm font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href="/"
        >
          ← Lucas Arango
        </Link>
        <h1 className="text-2xl font-medium tracking-tight text-balance">{title}</h1>
        <p className="text-sm/6 text-balance text-muted-foreground">{description}</p>
      </div>
      {children}
    </main>
  );
}
