import { redirect } from "next/navigation";

// Bare `/console/grocery` has no thread yet. Mint one and redirect so the active
// thread always lives in the URL — making the conversation refreshable and
// shareable, and giving CopilotKit/ADK a stable session key (see [thread]/page).
export default function Page() {
  redirect(`/console/grocery/${crypto.randomUUID()}`);
}
