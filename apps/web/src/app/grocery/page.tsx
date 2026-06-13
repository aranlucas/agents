import { redirect } from "next/navigation";

export default function Page() {
  redirect("/console/grocery");
  // `redirect` throws; the return keeps the inferred type a valid React element.
  return null;
}
