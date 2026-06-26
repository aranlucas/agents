import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/console/excalidraw/${crypto.randomUUID()}`);
}
