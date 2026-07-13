type CopilotKitHeaderTransport = {
  readonly headers: Record<string, string>;
  setHeaders(headers: Record<string, string | null | undefined>): void;
};

type RunWithCurrentClerkTokenOptions<TResult> = {
  copilotkit: CopilotKitHeaderTransport;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  run: () => Promise<TResult>;
};

/** Refresh Clerk auth immediately before a CopilotKit run reaches the transport. */
export async function runWithCurrentClerkToken<TResult>({
  copilotkit,
  getToken,
  userId,
  run,
}: RunWithCurrentClerkTokenOptions<TResult>): Promise<TResult> {
  const token = await getToken();

  copilotkit.setHeaders({
    ...copilotkit.headers,
    Authorization: token ? `Bearer ${token}` : undefined,
    "x-clerk-user-id": token ? userId : undefined,
  });

  return run();
}
