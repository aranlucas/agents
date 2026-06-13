import { redirect } from "next/navigation";

// Bare `/console/travel` has no thread yet. Mint one and redirect so the active
// thread always lives in the URL — making the conversation refreshable and
// shareable, and giving CopilotKit/ADK a stable session key (see [thread]/page).
export default function Page() {
  redirect(`/console/travel/${crypto.randomUUID()}`);
}
