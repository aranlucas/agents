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
          <div className="mx-auto w-full max-w-225 px-5 py-8 sm:px-8 sm:py-12">
            <div className="mb-8 border-b border-border pb-7">
              <p className="font-mono text-xs tracking-widest text-primary uppercase">
                Console preferences
              </p>
              <h1 className="mt-3 text-4xl/10 font-medium tracking-tighter">Settings</h1>
              <p className="mt-3 max-w-xl text-sm/6 text-muted-foreground">
                Manage your account, security, and connected profile in one place.
              </p>
            </div>
            <div className="overflow-hidden border border-border bg-card shadow-card">
              <UserProfile routing="hash" />
            </div>
          </div>
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}
