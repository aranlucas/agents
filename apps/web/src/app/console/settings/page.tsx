"use client";

import { UserProfile } from "@clerk/nextjs";

import { NavRail, SETTINGS_PATH } from "@/components/chat/NavRail";

export default function SettingsPage() {
  return (
    // Mirrors the /console/[agent] shell: rail (top bar on mobile, left rail on
    // desktop) beside a scrollable content column.
    <main className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <div className="flex-none">
        <NavRail activePath={SETTINGS_PATH} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-225 px-4 py-6">
          <h1 className="text-foreground mb-4 text-lg font-semibold">Settings</h1>
          <UserProfile routing="hash" />
        </div>
      </div>
    </main>
  );
}
