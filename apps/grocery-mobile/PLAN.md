# Grocery Agent Android plan

## Goal

Deliver a polished Grocery Agent that runs locally on the Android Pixel API 35
emulator. Kroger is a required connection. Public launch work is intentionally
deferred until the local flow is verified end to end.

## Current state

- [x] Create a focused `apps/grocery-mobile` Expo application.
- [x] Add Clerk Google and email authentication.
- [x] Require Kroger before entering grocery planning.
- [x] Add Kroger OAuth handoff and app callback handling.
- [x] Add grocery chat, plan artifacts, list review, and explicit cart approval.
- [x] Add branded Android icon, adaptive icon, monochrome icon, and splash art.
- [x] Add direct `expo-document-picker` and `expo-file-system` dependencies.
- [x] Enable host keyboard input for the Pixel API 35 emulator.
- [x] Pass package typecheck, lint, formatting, unit tests, React Doctor, and
      Android JavaScript export.

## Remaining local Android work

1. [ ] Add `expo-dev-client` to Grocery Agent and make its Android command use
       `expo run:android`, so the app never depends on Expo Go.
2. [ ] Remove the old `apps/mobile` port from the grocery workflow and use one
       canonical Metro port and native package for local development.
3. [ ] Resolve Clerk authentication before mounting `CopilotKitProvider`, then
       send `Authorization` and `x-clerk-user-id` on the initial runtime `/info`
       request. Keep token refresh immediately before every agent run.
4. [ ] Rebuild and install the Grocery Agent native client on Pixel API 35.
5. [ ] Verify Clerk sign-in and the Android redirect back into Grocery Agent.
6. [ ] Verify the required Kroger screen, secure OAuth browser handoff, callback,
       connection refresh, and connected state. Completing Kroger authorization
       requires a real Kroger test account.
7. [ ] Verify grocery prompt submission, streamed response rendering, meal/list
       artifact rendering, list review, and the explicit add-to-cart confirmation.
8. [ ] Capture clean emulator screenshots and confirm no native-module,
       JavaScript, Android runtime, or authenticated gateway errors in logs.
9. [ ] Run the final package and repository gates:
       `pnpm --filter grocery-mobile typecheck`, lint, format check, tests,
       Expo Doctor/export, React Doctor, then `pnpm check && pnpm test`.

## Completion criteria

The local milestone is complete when a signed-in user can open the installed
Grocery Agent Android client, connect Kroger, submit a grocery request, review
the resulting plan, reach the explicit cart confirmation, and repeat the flow
without Expo Go, Metro redirect, authentication, or native-module failures.

## Deferred release work

Landing-page deployment, production Clerk and Kroger configuration, Kroger API
approval and compliance, privacy and deletion infrastructure, EAS credentials,
Google Play declarations, store assets, and testing tracks are maintained in
[STORE_RELEASE_TODO.md](./STORE_RELEASE_TODO.md).
