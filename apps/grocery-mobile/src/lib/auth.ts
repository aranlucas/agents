type HeaderTransport = {
  readonly headers: Record<string, string>;
  setHeaders(headers: Record<string, string | null | undefined>): void;
};

type AuthenticatedRunOptions<TResult> = {
  transport: HeaderTransport;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  run: () => Promise<TResult>;
};

export async function runAuthenticated<TResult>({
  transport,
  getToken,
  userId,
  run,
}: AuthenticatedRunOptions<TResult>): Promise<TResult> {
  if (!userId) throw new Error("Your session has expired. Please sign in again.");
  const token = await getToken();
  if (!token) throw new Error("We could not refresh your session. Please sign in again.");

  transport.setHeaders({
    ...transport.headers,
    Authorization: `Bearer ${token}`,
    "x-clerk-user-id": userId,
  });

  return run();
}

export function readableError(error: unknown): string {
  if (error && typeof error === "object" && "errors" in error) {
    const errors = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    const first = errors?.[0];
    if (first?.longMessage || first?.message) return first.longMessage ?? first.message ?? "";
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
