import { auth, clerkClient } from "@clerk/nextjs/server";

export const STRAVA_PROVIDER = "oauth_custom_strava";

export async function getStravaAccessToken() {
  const { userId } = await auth();
  if (!userId) {
    return { connected: false, token: null };
  }

  const client = await clerkClient();
  const { data: tokens } = await client.users.getUserOauthAccessToken(
    userId,
    STRAVA_PROVIDER as never,
  );
  const token = tokens[0]?.token ?? null;

  return { connected: Boolean(token), token };
}
