import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Apple,
  ArrowRight,
  BatteryMedium,
  Bean,
  Beef,
  Check,
  CircleCheck,
  CircleUserRound,
  Eye,
  FileText,
  Leaf,
  Milk,
  Nut,
  Package,
  Paperclip,
  Salad,
  Send,
  ShoppingCart,
  Sparkles,
  Trash2,
  Wifi,
} from "lucide-react";

import {
  groceryPrimaryLinkClassName,
  grocerySecondaryLinkClassName,
} from "@/components/grocery/grocery-chrome";

const groceryItems: ReadonlyArray<{
  Icon: LucideIcon;
  label: string;
  tone: string;
}> = [
  { Icon: Beef, label: "Ground beef", tone: "bg-warning-soft text-warning" },
  { Icon: Package, label: "Taco shells", tone: "bg-accent text-accent-foreground" },
  { Icon: Bean, label: "Beans", tone: "bg-danger-soft text-destructive" },
  { Icon: Apple, label: "Salsa", tone: "bg-success-soft text-success" },
  { Icon: Nut, label: "Avocado", tone: "bg-grocery/10 text-grocery" },
  { Icon: Milk, label: "Cheese", tone: "bg-muted text-muted-foreground" },
];

const pantryItems = [
  { checked: true, label: "Olive oil" },
  { checked: true, label: "Ground beef" },
  { checked: true, label: "Taco seasoning" },
  { checked: false, label: "Tortillas" },
  { checked: false, label: "Bell pepper" },
  { checked: false, label: "Shredded cheese" },
] as const;

function ProductTiles({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid grid-cols-6 gap-2" aria-label="Example grocery items">
      {groceryItems.map(({ Icon, label, tone }) => (
        <div
          className={`${tone} flex aspect-square items-center justify-center rounded-lg border border-border/70`}
          key={label}
          title={label}
        >
          <Icon aria-hidden="true" className={compact ? "size-4" : "size-5"} />
          <span className="sr-only">{label}</span>
        </div>
      ))}
    </div>
  );
}

function PhonePreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm rounded-4xl border-8 border-neutral-900 bg-neutral-900 p-1 shadow-2xl">
      <div className="aspect-1/2 overflow-hidden rounded-3xl bg-white text-neutral-950">
        <div className="flex h-full flex-col">
          <div className="flex h-8 items-center justify-between px-4 text-xs font-semibold">
            <span>9:30</span>
            <span className="flex items-center gap-1">
              <Wifi aria-hidden="true" className="size-3" />
              <BatteryMedium aria-hidden="true" className="size-4" />
            </span>
          </div>

          <div className="flex h-14 items-center gap-3 border-b border-neutral-200 px-4">
            <Salad aria-hidden="true" className="size-6 text-grocery" />
            <span className="font-semibold">Grocery Agent</span>
            <CircleUserRound aria-hidden="true" className="ms-auto size-7" />
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-grocery">
                <Sparkles aria-hidden="true" className="size-4" />
              </span>
              <p className="pt-1 text-sm leading-5">
                I used what you already have and built the rest of the list.
              </p>
            </div>

            <div className="rounded-2xl border border-grocery/30 bg-success-soft/20 p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-grocery">
                  <Salad aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">Weeknight tacos</p>
                  <p className="text-xs text-neutral-600">Kroger · 12 items · about $38</p>
                </div>
              </div>
              <div className="mt-4">
                <ProductTiles compact />
              </div>
              <div className="mt-4 flex h-10 items-center justify-center rounded-lg bg-grocery text-sm font-semibold text-white">
                Review 12 items
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
                <Package aria-hidden="true" className="size-4 text-grocery" />
                Pantry staples skipped: salt, oil
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-grocery">
                <CircleCheck aria-hidden="true" className="size-5" />
              </span>
              Your list is ready to review.
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-grocery/30 p-3 text-xs">
              <ShoppingCart aria-hidden="true" className="size-6 shrink-0 text-grocery" />
              <span className="text-neutral-600">Connect Kroger for live prices and matches.</span>
              <span className="ms-auto shrink-0 font-semibold text-grocery">Connect</span>
            </div>
          </div>

          <div className="m-3 flex h-12 items-center rounded-full border border-neutral-200 px-4 text-xs text-neutral-500 shadow-sm">
            Ask for meals or a grocery list
            <Paperclip aria-hidden="true" className="ms-auto size-5 text-neutral-800" />
            <span className="ms-2 flex size-8 items-center justify-center rounded-full bg-grocery text-white">
              <Send aria-hidden="true" className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      aria-hidden="true"
      className="absolute -inset-e-7 top-1/2 z-10 hidden -translate-y-1/2 lg:flex"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-grocery text-white shadow-md">
        <ArrowRight className="size-6" />
      </span>
    </div>
  );
}

function FlowCard({ children, showArrow = false }: { children: ReactNode; showArrow?: boolean }) {
  return (
    <div className="relative h-full">
      <div className="h-full rounded-2xl border border-border bg-card p-6 shadow-sm">
        {children}
      </div>
      {showArrow ? <FlowArrow /> : null}
    </div>
  );
}

function PantryRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={
          checked
            ? "flex size-5 items-center justify-center rounded-sm border border-grocery bg-success-soft text-grocery"
            : "size-5 rounded-sm border border-border bg-card"
        }
      >
        {checked ? <Check aria-hidden="true" className="size-3" /> : null}
      </span>
      {label}
    </li>
  );
}

export default function GroceryPage() {
  return (
    <main className="flex-1 bg-card">
      <section className="relative overflow-hidden border-b border-border bg-linear-to-r from-card via-card to-success-soft/40">
        <div aria-hidden="true" className="absolute inset-s-4 top-4 hidden flex-col gap-6 lg:flex">
          <span className="flex size-24 items-center justify-center rounded-2xl bg-success-soft/50 text-grocery/50">
            <Leaf className="size-12" />
          </span>
          <span className="block size-14 rounded-xl bg-success-soft/30" />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-s-12 bottom-8 hidden flex-col gap-6 lg:flex"
        >
          <span className="flex size-24 items-center justify-center rounded-2xl bg-success-soft/50 text-grocery/50">
            <Apple className="size-12" />
          </span>
          <span className="block size-14 rounded-xl bg-success-soft/30" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-20 lg:py-10">
          <div className="mx-auto max-w-xl lg:mx-0 lg:ps-24">
            <h1
              aria-label="Plan dinner. Build the list. Keep the final say."
              className="text-5xl leading-none font-semibold tracking-tight sm:text-6xl lg:text-7xl"
            >
              Plan dinner.
              <br />
              Build the list.
              <br />
              Keep the final say.
            </h1>
            <p className="mt-8 max-w-lg text-lg leading-8 text-ink-soft sm:text-xl">
              Turn a recipe, photo, or weeknight idea into a practical grocery list. Connect Kroger
              when you want live products, deals, and cart actions.
            </p>
            <div className="mt-8 flex max-w-xs flex-col gap-4">
              <Link className={groceryPrimaryLinkClassName} href="/console/grocery">
                Try Grocery Agent
              </Link>
              <Link className={grocerySecondaryLinkClassName} href="/grocery/support#android">
                Android app coming soon
              </Link>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md py-4 lg:py-0">
            <PhonePreview />
          </div>
        </div>
      </section>

      <section className="scroll-mt-8 px-5 py-20 sm:px-8 sm:py-24" id="how-it-works">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              From idea to aisle
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-ink-soft">
              A simple way to turn any idea into a practical grocery list you control.
            </p>
          </div>

          <ol className="mt-14 grid gap-8 md:grid-cols-3">
            <li>
              <h3 className="text-xl font-semibold">
                <span className="me-2 text-grocery">1 ·</span>Ask naturally
              </h3>
              <p className="mt-3 max-w-sm leading-7 text-ink-soft">
                Paste a recipe link, attach a photo, or describe the meals you need.
              </p>
            </li>
            <li>
              <h3 className="text-xl font-semibold">
                <span className="me-2 text-grocery">2 ·</span>Use what you have
              </h3>
              <p className="mt-3 max-w-sm leading-7 text-ink-soft">
                Add pantry staples so Grocery Agent can leave duplicates off the list.
              </p>
            </li>
            <li>
              <h3 className="text-xl font-semibold">
                <span className="me-2 text-grocery">3 ·</span>Review every item
              </h3>
              <p className="mt-3 max-w-sm leading-7 text-ink-soft">
                Connect Kroger for live matches and deals. Nothing changes in your cart unless you
                ask.
              </p>
            </li>
          </ol>

          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            <FlowCard showArrow>
              <h3 className="font-semibold">Recipe or idea</h3>
              <div className="mx-auto mt-6 flex aspect-4/5 max-w-36 items-center justify-center rounded-xl border border-grocery/20 bg-success-soft/30 text-grocery">
                <FileText aria-hidden="true" className="size-16 stroke-1" />
              </div>
              <p className="mt-6 text-sm leading-6 text-ink-soft">
                “Creamy taco skillet with peppers”
              </p>
            </FlowCard>

            <FlowCard showArrow>
              <h3 className="font-semibold">What you have</h3>
              <ul className="mt-6 flex flex-col gap-4">
                {pantryItems.map((item) => (
                  <PantryRow {...item} key={item.label} />
                ))}
              </ul>
            </FlowCard>

            <FlowCard>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-grocery">
                  <Salad aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold">Weeknight tacos</h3>
                  <p className="text-sm text-muted-foreground">Kroger · 12 items · about $38</p>
                </div>
              </div>
              <div className="mt-7">
                <ProductTiles />
              </div>
              <div className="mt-7 flex h-11 items-center justify-center rounded-lg bg-grocery font-semibold text-white">
                Review 12 items
              </div>
            </FlowCard>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-linear-to-r from-success-soft/50 to-card px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Your list stays yours.
            </h2>
            <div className="mt-12 flex flex-col gap-10">
              <div className="flex gap-5">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-grocery/20 bg-success-soft/30 text-grocery">
                  <ShoppingCart aria-hidden="true" className="size-8" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">Kroger is optional.</h3>
                  <p className="mt-1 max-w-sm leading-7 text-ink-soft">
                    Connect only if you want live prices, deals, and item matches.
                  </p>
                </div>
              </div>
              <div className="flex gap-5">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-grocery/20 bg-success-soft/30 text-grocery">
                  <Eye aria-hidden="true" className="size-8" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">Review before any cart action.</h3>
                  <p className="mt-1 max-w-sm leading-7 text-ink-soft">
                    Nothing is added, removed, or changed unless you confirm.
                  </p>
                </div>
              </div>
              <div className="flex gap-5">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-grocery/20 bg-success-soft/30 text-grocery">
                  <Trash2 aria-hidden="true" className="size-8" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">Manage your account and data.</h3>
                  <p className="mt-1 max-w-sm leading-7 text-ink-soft">
                    Account settings and support explain the current deletion process.
                  </p>
                  <Link
                    className="mt-2 inline-block font-medium text-grocery underline underline-offset-4"
                    href="/grocery/delete-account"
                  >
                    See deletion options
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 text-center sm:px-8 sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ready for an easier grocery run?
        </h2>
        <div className="mx-auto mt-9 flex max-w-xs flex-col gap-4">
          <Link className={groceryPrimaryLinkClassName} href="/console/grocery">
            Try Grocery Agent
          </Link>
          <Link className={grocerySecondaryLinkClassName} href="/grocery/support#android">
            Android app coming soon
          </Link>
        </div>
      </section>
    </main>
  );
}
