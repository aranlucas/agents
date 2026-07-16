# Grocery Agent store-release TODO

The current milestone is a polished local Android build. Do not represent the
Kroger integration or Google Play release as production-ready until this list is
closed.

## Kroger approval and API contract

- [ ] Ask `APISupport@kroger.com` for written approval or clarification before
      sending any product-search or cart-derived data to an external AI model.
      Kroger's [Acceptable Use policy](https://developer.kroger.com/documentation/public/getting-started/acceptable-use)
      restricts tracking, sharing, and storing data derived from product searches
      and cart additions.
- [ ] Keep every cart write behind a visible, explicit user action. Change
      `requestCheckoutConfirmation` so an MCP client without elicitation support
      rejects the write instead of treating missing UI as consent.
- [ ] Use only the public add-to-cart operation. Disable `view_cart`, cart-ID
      persistence, and read/update-cart claims unless Kroger grants
      [Partner access](https://developer.kroger.com/documentation/partner).
- [ ] Remove persistence of Kroger-derived preferred locations, cart mirrors,
      cart snapshots, cart IDs, and product/store/price order history. Keep only
      clearly user-authored generic lists and pantry data. See Kroger's
      [public Cart overview](https://developer.kroger.com/documentation/api-products/public/cart/overview).
- [ ] Make product/location caching honor Kroger's response cache headers. The
      current middleware in `apps/ai-shopping-mcp/src/services/kroger/client.ts`
      uses a fixed ten-minute TTL.
- [ ] Remove or obtain permission for weekly-deal/site-content republishing;
      the public API catalog does not provide a general deals API.

## Kroger display and branding

- [ ] Follow Kroger's [Branding Guidelines](https://developer.kroger.com/documentation/public/getting-started/branding):
      do not put Kroger in the app name or imply sponsorship, and use an approved
      integration mark where required.
- [ ] Display returned product names, descriptions, and prices without rewriting
      them; do not compare prices across retailers.
- [ ] Do not translate `instore=true` into “In stock.” Show selected-store
      context and treat missing prices as unavailable.
- [ ] Render returned product imagery uncropped and unmodified, and build product
      links from the returned `productPageURI` and chain domain.
- [ ] Open Kroger pages externally rather than in a framed webview and complete
      any release notice required by Kroger's
      [Website and App Terms](https://www.kroger.com/i/terms/website-and-app).

## Production registration and Google Play

- [ ] Build and deploy the public landing page before publishing the store
      listing. Keep its privacy, terms, support, and account-deletion URLs
      stable after launch.
- [ ] Register a separate Kroger Production application and every Android OAuth
      redirect URI. The Kroger application environment cannot be changed later.
- [ ] Keep OAuth client secrets and rotating refresh tokens server-side; use the
      documented Authorization Code flow.
- [ ] Publish accurate privacy, terms, support, and account-deletion resources,
      including Clerk, Kroger, AI processors, retention, deletion/export, and
      security-incident disclosures.
- [ ] Implement coordinated account deletion across Clerk, gateway D1/R2, and
      connected-service data before completing Play's Data safety form.
- [ ] Add a durable in-app AI-response reporting path, production Clerk and
      gateway configuration, final store screenshots/listing copy, content
      rating, reviewer access, signing/service-account setup, and any required
      closed test.
