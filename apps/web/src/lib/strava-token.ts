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
    STRAVA_PROVIDER as never,
  );
  const token = tokens[0]?.token ?? null;
  console.log(
    `[strava-token] provider=${STRAVA_PROVIDER} tokenCount=${tokens.length} tokenPresent=${Boolean(token)}`,
  );

  return { connected: Boolean(token), token };
}
