import { redirect } from "next/navigation";

export default function Page() {
  redirect("/console/oral-boards");
  // `redirect` throws; the return keeps the inferred type a valid React element.
  return null;
}
