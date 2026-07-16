import type { Metadata } from "next";
import Link from "next/link";

import { GroceryDocument, GroceryDocumentSection } from "@/components/grocery/grocery-chrome";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for using Grocery Agent and its optional Kroger-connected features.",
};

export default function GroceryTermsPage() {
  return (
    <GroceryDocument
      eyebrow="Terms"
      title="Terms of use"
      description="These terms set the practical boundaries for using Grocery Agent and its connected grocery features."
    >
      <p className="text-sm text-muted-foreground">
        Effective: <time dateTime="2026-07-15">July 15, 2026</time>
      </p>

      <GroceryDocumentSection title="The service">
        <p>
          Grocery Agent helps turn meal ideas, recipes, and pantry information into grocery lists.
          If you choose to connect Kroger, it can also look up participating stores, products,
          prices, availability, deals, and requested cart actions.
        </p>
        <p>
          Grocery Agent is independent from Kroger and is not a grocery retailer, delivery provider,
          or payment processor. Checkout, payment, fulfillment, substitutions, refunds, and store
          service remain between you and the relevant retailer.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Your account and connected services">
        <p>
          You are responsible for activity through your account and for keeping your sign-in methods
          secure. Do not share passwords, verification codes, or connected-account tokens with
          support. Kroger connection is optional and subject to Kroger&apos;s own terms.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Review before acting">
        <p>
          AI output can be incomplete or wrong. Product matches, quantities, dietary assumptions,
          prices, deals, and availability can change. Review the full list and the retailer&apos;s
          cart before confirming any action or purchase.
        </p>
        <p>
          Grocery Agent does not provide medical, allergy, nutrition, or food-safety advice. Check
          labels and consult a qualified professional when a decision could affect health or safety.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Acceptable use">
        <p>
          Do not use the service to break the law, harm others, interfere with service operation,
          bypass access controls, probe connected accounts without permission, or submit content you
          do not have the right to use.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Availability and changes">
        <p>
          Features may be changed, suspended, or unavailable, including when a third-party service
          changes or fails. The service is provided on an as-available basis without a promise that
          every response, product match, or connected action will be accurate or uninterrupted.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Privacy, support, and ending use">
        <p>
          The{" "}
          <Link
            className="font-medium text-grocery underline underline-offset-4"
            href="/grocery/privacy"
          >
            privacy policy
          </Link>{" "}
          explains data processing. For help, visit{" "}
          <Link
            className="font-medium text-grocery underline underline-offset-4"
            href="/grocery/support"
          >
            support
          </Link>
          . To stop using the service or request deletion, follow the{" "}
          <Link
            className="font-medium text-grocery underline underline-offset-4"
            href="/grocery/delete-account"
          >
            account deletion process
          </Link>
          .
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a
            className="font-medium text-grocery underline underline-offset-4"
            href="mailto:aranlucas@gmail.com?subject=Grocery%20Agent%20terms"
          >
            aranlucas@gmail.com
          </a>
          .
        </p>
      </GroceryDocumentSection>
    </GroceryDocument>
  );
}
