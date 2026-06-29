const OFFLINE_AGENT_TEST_MODE = "offline";

export function isOfflineAgentTestMode(): boolean {
  return (
    process.env.AGENT_TEST_MODE === OFFLINE_AGENT_TEST_MODE ||
    process.env.NEXT_PUBLIC_AGENT_TEST_MODE === OFFLINE_AGENT_TEST_MODE
  );
}
