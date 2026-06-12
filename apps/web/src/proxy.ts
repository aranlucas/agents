import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

export const PROTECTED_ROUTES = [
  "/travel(.*)",
  "/grocery(.*)",
  "/fitness(.*)",
  "/wellness(.*)",
  "/oral-boards(.*)",
  "/a2ui(.*)",
  "/console/travel(.*)",
  "/console/grocery(.*)",
  "/console/fitness(.*)",
  "/console/wellness(.*)",
  "/console/oral-boards(.*)",
  "/console/a2ui(.*)",
  "/console/settings(.*)",
];

const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTES);

export default clerkMiddleware(async (auth, req) => {
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
