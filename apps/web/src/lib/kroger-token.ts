import { auth, clerkClient } from "@clerk/nextjs/server";

export const KROGER_PROVIDER = "custom_shopping";

export async function getKrogerAccessToken() {
  const { userId } = await auth();
  if (!userId) {
    return { connected: false, token: null };
  }

  const client = await clerkClient();
  const { data: tokens } = await client.users.getUserOauthAccessToken(
    userId,
    KROGER_PROVIDER as never,
  );
  const token = tokens[0]?.token ?? null;

  return { connected: Boolean(token), token };
}
