import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) redirect("/sign-in");
  return children;
}
