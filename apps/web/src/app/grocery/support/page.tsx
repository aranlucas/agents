import type { Metadata } from "next";
import Link from "next/link";
import { Bug, CircleHelp, ExternalLink, Mail, Smartphone } from "lucide-react";

import {
  GroceryDocument,
  GroceryDocumentSection,
  groceryPrimaryLinkClassName,
  grocerySecondaryLinkClassName,
} from "@/components/grocery/grocery-chrome";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Grocery Agent, Kroger connection, account access, or data requests.",
};

export default function GrocerySupportPage() {
  return (
    <GroceryDocument
      eyebrow="Support"
      title="How can we help?"
      description="Get help with sign-in, grocery lists, Kroger connection, cart handoff, or account data."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <a
          className={groceryPrimaryLinkClassName}
          href="mailto:aranlucas@gmail.com?subject=Grocery%20Agent%20support"
        >
          <Mail aria-hidden="true" className="size-5" />
          Email support
        </a>
        <a
          className={grocerySecondaryLinkClassName}
          href="https://github.com/aranlucas/agents/issues/new?title=Grocery%20Agent%20bug"
          rel="noreferrer"
          target="_blank"
        >
          <Bug aria-hidden="true" className="size-5" />
          Report a public bug
          <ExternalLink aria-hidden="true" className="size-4" />
        </a>
      </div>
      <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-6 text-ink-soft">
        GitHub issues are public. Do not post your email address, order details, passwords,
        verification codes, Kroger credentials, or other personal information there.
      </p>

      <GroceryDocumentSection title="Before you contact support">
        <p>Include the device or browser, the step that failed, and any error message you saw.</p>
        <p>
          Never send a password, one-time code, Clerk token, Kroger authorization code, or full
          payment information. Grocery Agent support does not need those details.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Common questions">
        <div className="flex flex-col gap-7">
          <div className="flex gap-4">
            <CircleHelp aria-hidden="true" className="mt-1 size-6 shrink-0 text-grocery" />
            <div>
              <h3 className="font-semibold text-foreground">Do I need a Kroger account?</h3>
              <p className="mt-1">
                No. You can plan meals and build a general list without Kroger. Connect Kroger only
                for live stores, products, deals, and requested cart actions.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <CircleHelp aria-hidden="true" className="mt-1 size-6 shrink-0 text-grocery" />
            <div>
              <h3 className="font-semibold text-foreground">
                Why is a price or product different?
              </h3>
              <p className="mt-1">
                Store inventory, prices, promotions, and availability can change. Treat Grocery
                Agent&apos;s result as a planning aid and review the retailer&apos;s current cart
                before checkout.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <CircleHelp aria-hidden="true" className="mt-1 size-6 shrink-0 text-grocery" />
            <div>
              <h3 className="font-semibold text-foreground">How do I manage my account?</h3>
              <p className="mt-1">
                Open{" "}
                <Link
                  className="font-medium text-grocery underline underline-offset-4"
                  href="/console/settings"
                >
                  signed-in settings
                </Link>{" "}
                for the Clerk account controls currently available. Associated Grocery Agent data
                has a separate manual request process.
              </p>
            </div>
          </div>
        </div>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Android app">
        <div className="flex gap-4" id="android">
          <Smartphone aria-hidden="true" className="mt-1 size-6 shrink-0 text-grocery" />
          <div>
            <h3 className="font-semibold text-foreground">The Android app is coming soon.</h3>
            <p className="mt-1">
              There is not yet a verified Google Play listing. This page will point to the official
              listing after it is published; until then, use Grocery Agent on the web.
            </p>
            <Link
              className="mt-4 inline-flex font-medium text-grocery underline underline-offset-4"
              href="/console/grocery"
            >
              Open Grocery Agent on the web
            </Link>
          </div>
        </div>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Account and data requests">
        <p>
          For the current account-management and associated-data request paths, visit{" "}
          <Link
            className="font-medium text-grocery underline underline-offset-4"
            href="/grocery/delete-account"
          >
            Delete account and data
          </Link>
          .
        </p>
      </GroceryDocumentSection>
    </GroceryDocument>
  );
}
