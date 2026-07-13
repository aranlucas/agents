import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { AGENT_ORDER } from "@agents/types";
import { isOfflineAgentTestMode } from "@/lib/offline-mode";

const PROTECTED_CONSOLE_ROUTES = AGENT_ORDER.filter((agentId) => agentId !== "resume").map(
  (agentId) => `/console/${agentId}(.*)`,
);

export const PROTECTED_ROUTES = [
  "/travel(.*)",
  "/grocery(.*)",
  "/fitness(.*)",
  "/wellness(.*)",
  "/oral-boards(.*)",
  ...PROTECTED_CONSOLE_ROUTES,
  "/console/settings(.*)",
  "/telegram/link(.*)",
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
