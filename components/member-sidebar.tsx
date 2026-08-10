"use client";

import {
  BookOpenIcon,
  ClockIcon,
  HourglassIcon,
  KeyRoundIcon,
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
 * Member navigation. Every entry is a read-only view of LIBRARY data —
 * nothing here alters a loan, a fine or an account's standing, which is the
 * point of the member portal.
 *
 * Password is the one exception, and deliberately so: it writes to the
 * member's own auth account, not to anything the library owns.
 */
const NAV = [
  { title: "My books", url: "/my", icon: BookOpenIcon },
  { title: "History", url: "/my/history", icon: ClockIcon },
  { title: "Catalogue", url: "/my/catalogue", icon: LibraryBigIcon },
  { title: "Password", url: "/my/password", icon: KeyRoundIcon },
];

/**
 * What a pending or rejected account can actually reach.
 *
 * Password is here too: someone handed a temporary password at the counter
 * should be able to replace it while they wait to be approved.
 */
const STATUS_ONLY = [
  { title: "Account status", url: "/my/status", icon: HourglassIcon },
  { title: "Password", url: "/my/password", icon: KeyRoundIcon },
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
          <BrandMark size={32} variant="glyph" className="shrink-0" />
          {/* Stacked name over caption, as on the librarian side: two lines are
              what buy the name text-base at this width. See the note there for
              why "Library" is a caption rather than a second wordmark line. */}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base leading-snug font-semibold">
              Jeppiaar Educity
            </span>
            <span className="text-sidebar-foreground/70 truncate text-xs leading-tight font-medium tracking-[0.14em] uppercase">
              Library
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
