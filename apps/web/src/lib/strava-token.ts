import { auth, clerkClient } from "@clerk/nextjs/server";

export const STRAVA_PROVIDER = "oauth_custom_strava";

export async function getStravaAccessToken() {
  const { userId } = await auth();
  if (!userId) {
    console.log("[strava-token] no userId — user not authenticated");
    return { connected: false, token: null };
  }

  console.log(`[strava-token] fetching token for userId=${userId}`);
  const client = await clerkClient();
  const { data: tokens } = await client.users.getUserOauthAccessToken(
    userId,
    // Clerk's `OAuthProvider` is a closed union of built-in providers and does
    // not include custom OAuth providers like Strava, so a cast is required.
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    STRAVA_PROVIDER as never,
  );
  const tokenData = tokens[0];
  const token = tokenData?.token ?? null;
  const expiresAt = tokenData?.expiresAt; // Unix seconds
  const isExpired = expiresAt ? expiresAt * 1000 < Date.now() : false;

  console.log(
    `[strava-token] provider=${STRAVA_PROVIDER} tokenCount=${tokens.length} tokenPresent=${Boolean(token)} expiresAt=${expiresAt} isExpired=${isExpired}`,
  );

  if (isExpired) {
    console.warn("[strava-token] token is expired — user must reconnect Strava");
    return { connected: false, token: null };
  }

  return { connected: Boolean(token), token };
}
