import { NextResponse } from "next/server";

import { getKrogerAccessToken, KROGER_PROVIDER } from "@/lib/kroger-token";

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

/**
 * Returns whether the "shopping" provider is connected. Tokens stay server-side
 * and are forwarded to the agent from the CopilotKit runtime route.
 */
export async function GET() {
  try {
    const { connected, token } = await getKrogerAccessToken();
    return NextResponse.json({
      connected,
      ...(isDevelopment
        ? {
            debug: {
              provider: KROGER_PROVIDER,
              tokenAvailable: Boolean(token),
            },
          }
        : {}),
    });
  } catch (error) {
    // Provider not connected or token unavailable
    return NextResponse.json({
      connected: false,
      ...(isDevelopment
        ? {
            debug: { provider: KROGER_PROVIDER, error: getErrorDetails(error) },
          }
        : {}),
    });
  }
}
