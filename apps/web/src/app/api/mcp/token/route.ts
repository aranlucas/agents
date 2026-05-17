import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Returns the MCP OAuth token for the "shopping" provider if the current
 * Clerk user has connected their Kroger account. Used by the grocery page
 * to check connection status and seed the agent's session state.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ connected: false, token: null }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const { data: tokens } = await client.users.getUserOauthAccessToken(userId, "oauth_custom_shopping");

    const token = tokens[0]?.token ?? null;
    return NextResponse.json({ connected: !!token, token });
  } catch {
    // Provider not connected or token unavailable
    return NextResponse.json({ connected: false, token: null });
  }
}
