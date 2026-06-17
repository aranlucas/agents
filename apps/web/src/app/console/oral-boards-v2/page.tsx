import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/console/oral-boards-v2/${crypto.randomUUID()}`);
}
