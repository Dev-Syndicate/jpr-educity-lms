"use client";

import {
  BookOpenIcon,
  ClockIcon,
  HourglassIcon,
  LibraryBigIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { BrandMark } from "@/components/brand-mark";
import { NavUser } from "@/components/nav-user";
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
  useSidebar,
} from "@/components/ui/sidebar";
import type { CurrentUser } from "@/lib/types";

/**
 * Member navigation. Every entry is a read-only view — nothing here mutates
 * anything, which is the point of the member portal.
 */
const NAV = [
  { title: "My books", url: "/my", icon: BookOpenIcon },
  { title: "History", url: "/my/history", icon: ClockIcon },
  { title: "Catalogue", url: "/my/catalogue", icon: LibraryBigIcon },
];

/** What a pending or rejected account can actually reach. */
const STATUS_ONLY = [
  { title: "Account status", url: "/my/status", icon: HourglassIcon },
];

export function MemberSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: CurrentUser }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const approved = user.accountStatus === "active" && user.isActive;

  // Close the mobile sheet once navigation has happened, so the page you
  // just opened is not hidden behind it.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  // "/my" would otherwise match every child route.
  const isActive = (url: string) =>
    url === "/my" ? pathname === "/my" : pathname.startsWith(url);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-sidebar-border border-b pb-3">
        <Link
          href="/my"
          className="hover:bg-sidebar-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 leading-tight transition-colors"
        >
          {/* Glyph, for the same reason as the librarian sidebar: --sidebar is
              the tile's own green. */}
          <BrandMark size={30} variant="glyph" className="shrink-0" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sidebar-primary text-[0.6rem] font-semibold tracking-[0.18em] uppercase">
              Jeppiaar Educity
            </span>
            <span className="text-base leading-snug font-semibold text-balance">
              Library Management System
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* An unapproved account is bounced back to /my/status by the
                  DAL, so linking the rest would be a menu of dead ends. */}
              {(approved ? NAV : STATUS_ONLY).map((item) => (
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
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
