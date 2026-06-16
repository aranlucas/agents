"use client";

import Link from "next/link";
import { PencilIcon, SettingsIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@agents/ui";

export const SETTINGS_PATH = "/console/settings";

export function AppSidebar({
  onNewThread,
  activePath,
}: {
  onNewThread?: () => void;
  activePath?: string;
}) {
  const settingsActive = activePath === SETTINGS_PATH;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2">
        <div className="bg-primary grid h-7.5 w-7.5 place-items-center rounded-lg text-sm font-bold text-white">
          A
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {onNewThread && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="New thread" onClick={onNewThread}>
                <PencilIcon />
                <span>New thread</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href={SETTINGS_PATH} />}
              isActive={settingsActive}
              tooltip="Settings"
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <div className="flex items-center justify-center p-2">
          <div className="h-2.5 w-2.5 rounded-full bg-(--success)" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
