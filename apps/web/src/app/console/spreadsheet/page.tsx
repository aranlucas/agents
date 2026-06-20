import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/console/spreadsheet/${crypto.randomUUID()}`);
}
