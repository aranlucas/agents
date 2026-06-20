import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/console/research/${crypto.randomUUID()}`);
}
