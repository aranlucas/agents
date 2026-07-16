# Android APK releases

Grocery Agent APKs are built and signed on a local development machine, tested as the exact
release artifact, and then uploaded to a tagged GitHub Release. The existing repository GitHub
Actions APK workflow builds `apps/mobile`; it does not release this app.

## One-time setup

1. Install Android Studio and the Android SDK, authenticate `gh`, and authenticate EAS with
   `pnpm dlx eas-cli@21.0.0 login`.
2. Let EAS manage the Android production keystore, or configure ignored local credentials in
   `credentials.json`. Never commit a keystore or its passwords.
3. Copy `.env.example` to `.env.production.local` and set the production values. Only
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...` belongs in the APK. Keep Clerk secret keys and
   backend credentials on the server.

## Build, verify, and publish

From `apps/grocery-mobile`, replace `1.0.0` with the release version:

```sh
pnpm build:production-apk:android -- 1.0.0
adb install -r ./dist/grocery-agent-1.0.0.apk
pnpm publish:production-apk:android -- 1.0.0
```

The publish command requires a clean commit already pushed to its upstream branch. It creates and
pushes the `grocery-v1.0.0` tag, then publishes the APK and its SHA-256 checksum to GitHub Releases.
The Play Store production profile remains an Android App Bundle; `production-apk` is only for the
direct-download GitHub artifact.
