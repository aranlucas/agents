import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// Bare `/console/oral-boards` has no thread yet. Mint one and redirect so the active
// thread always lives in the URL — making the conversation refreshable and
// shareable, and giving CopilotKit/ADK a stable session key (see [thread]/page).
export default async function Page() {
  await auth.protect();
  redirect(`/console/oral-boards/${crypto.randomUUID()}`);
}
