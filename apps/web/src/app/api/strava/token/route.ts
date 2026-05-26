import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const STRAVA_PROVIDER = "custom_strava";
const isDevelopment = process.env.NODE_ENV !== "production";

function getErrorDetails(error: unknown) {
  if (!isDevelopment) return undefined;
  if (error && typeof error === "object") {
    const err = error as {
      clerkError?: boolean;
      status?: number;
      errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
      message?: string;
    };

    return {
      clerkError: err.clerkError,
      status: err.status,
      message: err.message,
      errors: err.errors?.map(({ code, message, longMessage }) => ({
        code,
        message,
        longMessage,
      })),
    };
  }

  return { message: String(error) };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ connected: false, token: null }, { status: 401 });
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const account = user.externalAccounts.find(
      ({ provider }) =>
        provider === STRAVA_PROVIDER || provider === `oauth_${STRAVA_PROVIDER}`,
    );
    const { data: tokens } = await client.users.getUserOauthAccessToken(
      userId,
      STRAVA_PROVIDER as never,
    );

    const token = tokens[0]?.token ?? null;
    return NextResponse.json({
      connected: !!token,
      token,
      ...(isDevelopment
        ? {
            debug: {
              provider: STRAVA_PROVIDER,
              externalAccount: account
                ? {
                    provider: account.provider,
                    providerUserId: account.providerUserId,
                    approvedScopes: account.approvedScopes,
                    verificationStatus: account.verification?.status,
                  }
                : null,
              tokenCount: tokens.length,
            },
          }
        : {}),
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      token: null,
      ...(isDevelopment
        ? { debug: { provider: STRAVA_PROVIDER, error: getErrorDetails(error) } }
        : {}),
    });
  }
}
