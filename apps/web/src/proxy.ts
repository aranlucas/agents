import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isOfflineAgentTestMode } from "@/lib/offline-mode";

export const PROTECTED_ROUTES = [
  "/travel(.*)",
  "/grocery(.*)",
  "/fitness(.*)",
  "/wellness(.*)",
  "/oral-boards(.*)",
  "/oralboards-v2(.*)",
  "/console/travel(.*)",
  "/console/grocery(.*)",
  "/console/fitness(.*)",
  "/console/wellness(.*)",
  "/console/oral-boards(.*)",
  "/console/oral-boards-v2(.*)",
  "/console/settings(.*)",
];

const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTES);

export default clerkMiddleware(async (auth, req) => {
  if (isOfflineAgentTestMode()) return;

  if (isProtectedRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);

    await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
