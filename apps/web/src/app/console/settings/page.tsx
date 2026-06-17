"use client";

import { UserProfile } from "@clerk/nextjs";

import { ScrollArea, SidebarInset, SidebarProvider, SidebarTrigger } from "@agents/ui";
import { AppSidebar, SETTINGS_PATH } from "@/components/chat/app-sidebar";

export default function SettingsPage() {
  return (
    // Mirrors the /console/[agent] shell: sidebar (icon rail on desktop, drawer
    // on mobile) beside a scrollable content column.
    <SidebarProvider defaultOpen={false} className="h-dvh overflow-hidden">
      <AppSidebar activePath={SETTINGS_PATH} />
      <SidebarInset className="min-h-0">
        <div className="flex shrink-0 items-center border-b px-2 py-1.5 md:hidden">
          <SidebarTrigger />
        </div>
        <ScrollArea className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-225 px-4 py-6">
            <h1 className="text-foreground mb-4 text-lg font-semibold">Settings</h1>
            <UserProfile routing="hash" />
          </div>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
