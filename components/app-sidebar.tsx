"use client";

import {
  BookOpenIcon,
  IndianRupeeIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  ShieldCheckIcon,
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
        {/* A wordmark, not a nav item: it sizes to its own two lines rather
            than to a menu row, so it does not sit in an oversized box. */}
        <Link
          href="/dashboard"
          className="hover:bg-sidebar-accent flex flex-col gap-0.5 rounded-md px-2 py-1.5 leading-tight transition-colors"
        >
          <span className="text-sidebar-primary text-[0.6rem] font-semibold tracking-[0.18em] uppercase">
            Jeppiaar Educity
          </span>
          <span className="text-base font-semibold">Library</span>
        </Link>
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
