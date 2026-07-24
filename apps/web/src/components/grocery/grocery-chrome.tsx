import type { ReactNode } from "react";
import Link from "next/link";
import { Salad } from "lucide-react";

import { buttonVariants } from "@agents/ui/components/button";
import { cn } from "@agents/ui/lib/utils";

const footerLinks = [
  { href: "/grocery/privacy", label: "Privacy" },
  { href: "/grocery/terms", label: "Terms" },
  { href: "/grocery/support", label: "Support" },
  { href: "/grocery/delete-account", label: "Delete account" },
] as const;

export const groceryPrimaryLinkClassName = cn(
  buttonVariants({ size: "lg" }),
  "h-12 rounded-xl bg-grocery px-8 text-base font-semibold text-grocery-contrast shadow-sm hover:bg-grocery/90",
);

export const grocerySecondaryLinkClassName = cn(
  buttonVariants({ size: "lg", variant: "outline" }),
  "h-12 rounded-xl border-grocery bg-card px-8 text-base font-medium text-grocery hover:bg-success-soft",
);

export function GroceryBrand() {
  return (
    <Link
      className="flex items-center gap-3 rounded-lg text-foreground outline-none focus-visible:ring-3 focus-visible:ring-grocery/40"
      href="/grocery"
      aria-label="Grocery Agent home"
    >
      <Salad aria-hidden="true" className="size-9 stroke-2 text-grocery" />
      <span className="text-xl font-semibold tracking-tight sm:text-2xl">Grocery Agent</span>
    </Link>
  );
}

export function GroceryHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <GroceryBrand />

        <nav aria-label="Grocery Agent" className="hidden items-center gap-10 md:flex">
          <Link className="font-medium hover:text-grocery" href="/grocery#how-it-works">
            How it works
          </Link>
          <Link className="font-medium hover:text-grocery" href="/grocery/privacy">
            Privacy
          </Link>
          <Link className="font-medium hover:text-grocery" href="/grocery/support">
            Support
          </Link>
        </nav>

        <Link
          aria-label="Try it on the web"
          className={cn(groceryPrimaryLinkClassName, "h-10 shrink-0 px-4 sm:h-12 sm:px-7")}
          href="/console/grocery"
        >
          <span className="sm:hidden">Try it</span>
          <span className="hidden sm:inline">Try it on the web</span>
        </Link>
      </div>
    </header>
  );
}

export function GroceryFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <GroceryBrand />
          <nav aria-label="Grocery Agent policies" className="flex flex-wrap gap-x-8 gap-y-3">
            {footerLinks.map(({ href, label }) => (
              <Link className="text-sm font-medium hover:text-grocery" href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-8 text-sm text-muted-foreground md:text-center">
          Independent from Kroger. Prices and availability can change.
        </p>
      </div>
    </footer>
  );
}

export function GroceryDocument({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex-1 bg-card">
      <header className="border-b border-border bg-success-soft/40">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <p className="text-sm font-semibold tracking-widest text-grocery uppercase">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-soft">{description}</p>
        </div>
      </header>
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-5 py-14 sm:px-8 sm:py-16">
        {children}
      </div>
    </main>
  );
}

export function GroceryDocumentSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-4 text-base leading-7 text-ink-soft">{children}</div>
    </section>
  );
}
