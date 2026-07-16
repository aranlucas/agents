import type { Metadata } from "next";
import Link from "next/link";

import { GroceryDocument, GroceryDocumentSection } from "@/components/grocery/grocery-chrome";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Grocery Agent processes account, conversation, and connected grocery data.",
};

export default function GroceryPrivacyPage() {
  return (
    <GroceryDocument
      eyebrow="Privacy"
      title="Privacy policy"
      description="This policy explains what Grocery Agent processes, why it is needed, and the choices available to you."
    >
      <p className="text-sm text-muted-foreground">
        Last updated: <time dateTime="2026-07-15">July 15, 2026</time>
      </p>

      <GroceryDocumentSection title="Scope">
        <p>
          This policy covers the Grocery Agent web experience and the related mobile app. Grocery
          Agent is an independent product and is not owned, sponsored, or operated by Kroger.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Information the service processes">
        <ul className="list-disc space-y-3 ps-6">
          <li>
            <strong className="text-foreground">Account information.</strong> Clerk provides the
            sign-in experience and supplies account identifiers and profile information needed to
            authenticate you.
          </li>
          <li>
            <strong className="text-foreground">Conversations and attachments.</strong> Prompts,
            recipe links, images you choose to attach, generated responses, and tool results are
            processed to provide the assistant.
          </li>
          <li>
            <strong className="text-foreground">Grocery preferences and work.</strong> The service
            may process a preferred store, pantry items, meal plans, shopping lists, product
            matches, and cart-action results when you use those features.
          </li>
          <li>
            <strong className="text-foreground">Connected Kroger information.</strong> If you
            connect Kroger, authorization is managed through the connected-account flow and used
            server-side to request store, product, deal, and cart information at your direction.
          </li>
          <li>
            <strong className="text-foreground">Technical information.</strong> Standard request,
            device, error, and security information may be processed to operate and protect the
            service.
          </li>
        </ul>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="How information is used">
        <ul className="list-disc space-y-3 ps-6">
          <li>Authenticate accounts and maintain sessions.</li>
          <li>Generate meal ideas, pantry-aware lists, and product matches.</li>
          <li>Perform a Kroger lookup or cart action only when the relevant feature is used.</li>
          <li>
            Diagnose errors, prevent abuse, secure the service, and respond to support requests.
          </li>
        </ul>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Service providers and connected services">
        <p>
          Grocery Agent relies on providers for authentication, hosting, storage, monitoring, and AI
          processing. Those providers process information on behalf of the service to perform their
          functions. When you connect Kroger, information needed for the requested grocery action is
          also sent to Kroger under its own terms and privacy practices.
        </p>
        <p>
          Information may also be disclosed when required by law, to protect the service or its
          users, or as part of a business transfer. This page does not make a broader promise about
          data practices that the current systems cannot verify.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Retention and deletion">
        <p>
          Different parts of the service retain information for different operational and security
          needs. Automated deletion of all account-associated app data is not currently available.
          You can manage the Clerk account controls available in settings and request review and
          deletion of associated Grocery Agent data through support.
        </p>
        <p>
          Read the current, step-by-step process on the{" "}
          <Link
            className="font-medium text-grocery underline underline-offset-4"
            href="/grocery/delete-account"
          >
            account deletion page
          </Link>
          .
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Security and your choices">
        <p>
          The service uses account authentication and server-side connected-service access to reduce
          exposure of credentials. No online system is perfectly secure. You can leave Kroger
          disconnected, review every proposed list, and avoid including sensitive personal
          information in prompts or attachments.
        </p>
      </GroceryDocumentSection>

      <GroceryDocumentSection title="Contact">
        <p>
          For privacy questions, email{" "}
          <a
            className="font-medium text-grocery underline underline-offset-4"
            href="mailto:aranlucas@gmail.com?subject=Grocery%20Agent%20privacy"
          >
            aranlucas@gmail.com
          </a>
          .
        </p>
      </GroceryDocumentSection>
    </GroceryDocument>
  );
}
