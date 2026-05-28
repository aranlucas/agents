import { NextResponse } from "next/server";

import { getStravaAccessToken, STRAVA_PROVIDER } from "@/lib/strava-token";

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
  try {
    const { connected, token } = await getStravaAccessToken();
    return NextResponse.json({
      connected,
      ...(isDevelopment
        ? {
            debug: {
              provider: STRAVA_PROVIDER,
              tokenAvailable: Boolean(token),
            },
          }
        : {}),
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      ...(isDevelopment
        ? {
            debug: { provider: STRAVA_PROVIDER, error: getErrorDetails(error) },
          }
        : {}),
    });
  }
}
