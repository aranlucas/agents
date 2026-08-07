import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Framing shared by /sign-in and /sign-up so the Clerk card arrives inside the
 * site rather than floating on an empty page. The desktop account column is
 * 30rem wide so its 2.5rem padding still leaves Clerk's 25rem card unobstructed.
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
      data-field-grid
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
    >
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden border border-border bg-background shadow-2xl md:flex">
        <aside className="relative hidden min-h-150 flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex md:min-w-0 md:flex-1">
          <span className="font-mono text-xs tracking-widest uppercase">Lucas Arango · Agents</span>
          <div>
            <p className="max-w-sm text-4xl/11 font-medium tracking-tighter text-balance">
              A focused place for useful work with personal agents.
            </p>
            <p className="mt-5 max-w-sm text-sm/6 text-primary-foreground/75">
              Your sessions, generated artifacts, and connected tools stay attached to your account.
            </p>
          </div>
          <span className="font-mono text-xs tracking-widest uppercase">Secure access — 01</span>
        </aside>
        <section className="flex min-h-150 min-w-0 flex-col justify-center gap-7 p-6 sm:p-10 md:w-120 md:shrink-0">
          <div className="flex flex-col gap-4">
            <Link
              className="w-fit rounded-sm font-mono text-xs font-medium tracking-widest text-primary uppercase transition-colors hover:text-primary/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href="/"
            >
              ← Lucas Arango
            </Link>
            <h1 className="text-3xl/9 font-medium tracking-tight text-balance">{title}</h1>
            <p className="text-sm/6 text-balance text-muted-foreground">{description}</p>
          </div>
          <div className="w-full min-w-0 [&_.cl-cardBox]:w-full! [&_.cl-rootBox]:w-full!">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
