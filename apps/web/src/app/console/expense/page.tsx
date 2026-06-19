import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/console/expense/${crypto.randomUUID()}`);
}
