import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Mail, Settings, ShieldCheck, Trash2 } from "lucide-react";

import {
  GroceryDocument,
  GroceryDocumentSection,
  groceryPrimaryLinkClassName,
  grocerySecondaryLinkClassName,
} from "@/components/grocery/grocery-chrome";

export const metadata: Metadata = {
  title: "Delete account and data",
  description:
    "Current account-management and manual associated-data deletion paths for Grocery Agent.",
};

export default function GroceryDeleteAccountPage() {
  return (
    <GroceryDocument
      eyebrow="Account and data"
      title="Delete account and data"
      description="Account controls and associated Grocery Agent data use separate paths today. This page explains both without implying an automated deletion that does not exist."
    >
      <div className="rounded-xl border border-warning/30 bg-warning-soft p-5 text-sm leading-6 text-foreground">
        Opening this page does not delete anything. Associated Grocery Agent data requests are
        reviewed and handled manually today.
      </div>

      <GroceryDocumentSection title="1. Manage your Clerk account">
        <div className="flex gap-4">
          <Settings aria-hidden="true" className="mt-1 size-6 shrink-0 text-grocery" />
          <div>
            <p>
              Sign in and open settings to use the account and connected-service controls Clerk
              currently makes available.
            </p>
            <Link className={`${grocerySecondaryLinkClassName} mt-5`} href="/console/settings">
              Open account settings
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </div>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="2. Request deletion of associated app data">
        <div className="flex gap-4">
          <Trash2 aria-hidden="true" className="mt-1 size-6 shrink-0 text-grocery" />
          <div>
            <p>
              Email support from the address on your account and ask for a review and deletion of
              data associated with your Grocery Agent account. Support may need to verify that the
              request comes from the account holder and will reply with the request scope, any
              required retention exceptions, and status.
            </p>
            <a
              className={`${groceryPrimaryLinkClassName} mt-5`}
              href="mailto:aranlucas@gmail.com?subject=Grocery%20Agent%20data%20deletion%20request"
            >
              <Mail aria-hidden="true" className="size-5" />
              Email a deletion request
            </a>
          </div>
        </div>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Important details">
        <ul className="list-disc space-y-3 ps-6">
          <li>
            Deleting or changing the Clerk account does not currently prove that all associated app
            data has also been removed. Use the support path above for that separate request.
          </li>
          <li>
            Disconnecting Kroger stops the connection available to Grocery Agent, but it does not
            delete information held independently by Kroger under its own policies.
          </li>
          <li>
            Do not include passwords, one-time codes, access tokens, Kroger credentials, payment
            information, or sensitive grocery details in the email.
          </li>
        </ul>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Protecting the request">
        <div className="flex gap-4">
          <ShieldCheck aria-hidden="true" className="mt-1 size-6 shrink-0 text-grocery" />
          <p>
            Identity verification helps prevent someone else from deleting your account-associated
            information. If support needs more information, it will ask only for what is needed to
            match and verify the account.
          </p>
        </div>
      </GroceryDocumentSection>
    </GroceryDocument>
  );
}
