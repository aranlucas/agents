"use client";

import Link from "next/link";
import { PencilIcon, SettingsIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
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
      <SidebarHeader>
        <div className="flex items-center justify-center py-2">
          <div className="bg-primary grid size-7.5 place-items-center rounded-lg text-sm font-bold text-white">
            A
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {onNewThread && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="New thread" onClick={onNewThread}>
                    <PencilIcon />
                    <span>New thread</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
          <div className="size-2.5 rounded-full bg-(--success)" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
