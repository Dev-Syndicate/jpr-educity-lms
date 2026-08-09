"use client";

import {
  BookOpenIcon,
  IndianRupeeIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserRoundCheckIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { CurrentUser } from "@/lib/types";

import { NavUser } from "./nav-user";

const COUNTER = [
  { title: "Counter", url: "/counter", icon: ScanBarcodeIcon },
  { title: "Loans", url: "/loans", icon: BookOpenIcon },
  { title: "Fines", url: "/fines", icon: IndianRupeeIcon },
];

const MANAGE = [
  { title: "Books", url: "/books", icon: LibraryBigIcon },
  { title: "Members", url: "/members", icon: UsersIcon },
  { title: "Registrations", url: "/registrations", icon: UserRoundCheckIcon },
  { title: "Librarians", url: "/staff", icon: ShieldCheckIcon },
];

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: CurrentUser }) {
  const pathname = usePathname();

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[slot=sidebar-menu-button]:!p-1.5"
              render={
                <Link href="/dashboard">
                  <span className="flex flex-col leading-tight">
                    <span className="text-sidebar-primary text-[0.6rem] font-semibold tracking-[0.18em] uppercase">
                      Jeppiaar Educity
                    </span>
                    <span className="text-base font-semibold">Library</span>
                  </span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Dashboard"
                  isActive={isActive("/dashboard")}
                  render={
                    <Link href="/dashboard">
                      <LayoutDashboardIcon />
                      <span>Dashboard</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Circulation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {COUNTER.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive(item.url)}
                    render={
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MANAGE.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive(item.url)}
                    render={
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Settings"
                  isActive={isActive("/settings")}
                  render={
                    <Link href="/settings">
                      <SettingsIcon />
                      <span>Settings</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
