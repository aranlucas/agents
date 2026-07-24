import { clerkMiddleware } from "@clerk/nextjs/server";

// Protect resources at their page/layout/route boundary instead of matching
// URL paths in middleware.
//
// `signInUrl`/`signUpUrl` must be set here, not only on `<ClerkProvider>`: the
// provider props are client-side, while `auth.protect()` resolves its redirect
// from the encrypted request data this middleware attaches (falling back to
// NEXT_PUBLIC_CLERK_SIGN_IN_URL). With neither set, Clerk sends signed-out
// users to the hosted Account Portal instead of our own /sign-in route.
export default clerkMiddleware({
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
