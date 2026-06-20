import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/console/presentation/${crypto.randomUUID()}`);
}
