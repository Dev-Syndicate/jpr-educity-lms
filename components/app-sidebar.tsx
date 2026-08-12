"use client";

import {
  BookOpenIcon,
  ChevronDownIcon,
  IndianRupeeIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  type CurrentUser,
} from "@/lib/types";

import { NavUser } from "./nav-user";

const COUNTER = [
  { title: "Counter", url: "/counter", icon: ScanBarcodeIcon },
  { title: "Loans", url: "/loans", icon: BookOpenIcon },
  { title: "Fines", url: "/fines", icon: IndianRupeeIcon },
];

const MANAGE = [
  { title: "Members", url: "/members", icon: UsersIcon },
  { title: "Librarians", url: "/staff", icon: ShieldCheckIcon },
];

/**
 * Books, plus one child per material category.
 *
 * "All books" leads the list because it is the common case and would
 * otherwise be reachable only by clicking the group header, which reads as a
 * disclosure control rather than a link.
 */
const BOOK_LINKS = [
  { title: "All books", url: "/books" },
  ...MATERIAL_CATEGORIES.map((value) => ({
    title: MATERIAL_CATEGORY_LABELS[value],
    url: `/books?category=${value}`,
  })),
];

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: CurrentUser }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile, setOpenMobile } = useSidebar();

  /**
   * Close the mobile sheet once navigation has happened.
   *
   * Keyed on the path rather than wired to each link, so it also covers the
   * wordmark and anything added later — and it only closes on a real
   * navigation, not on a tap that goes nowhere.
   */
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  const isActive = (url: string) =>
    pathname === url || pathname.startsWith(`${url}/`);

  const activeCategory = searchParams.get("category");
  const onBooks = isActive("/books");

  /**
   * Books is a CONTROLLED collapsible.
   *
   * `defaultOpen` is read once at mount, so deriving it from the path made it
   * change on navigation and Base UI warned:
   *
   *   "A component is changing the default open state of an uncontrolled
   *    Collapsible after being initialized."
   *
   * Controlled state keeps both behaviours that matter: navigating into
   * /books opens the group (below), and the librarian can still close it by
   * hand without the next render forcing it back open.
   */
  const [booksOpen, setBooksOpen] = useState(onBooks);

  // Adjusting state during render, rather than in an effect: React re-runs
  // this component immediately without painting the stale value, so there is
  // no flash and no cascading render. An effect here would be the
  // set-state-in-effect anti-pattern.
  //
  // Comparing against the PREVIOUS value is what makes a manual close stick:
  // this fires only on the render where you arrive at /books, not on every
  // render while you are there.
  const [wasOnBooks, setWasOnBooks] = useState(onBooks);
  if (onBooks !== wasOnBooks) {
    setWasOnBooks(onBooks);
    if (onBooks) setBooksOpen(true);
  }

  /**
   * A category link is current only when its own ?category= is the active one.
   *
   * Compared against the query string rather than the path, since every child
   * shares /books. "All books" is current when no category is filtered — and
   * only on the list itself, so a book's detail page does not light it up.
   */
  const isBookLinkActive = (url: string) => {
    const category = url.split("category=")[1] ?? null;
    if (!category) return pathname === "/books" && !activeCategory;
    return pathname === "/books" && activeCategory === category;
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      {/* A rule below the wordmark, matching the footer, so the brand is its
          own region and its second line cannot crowd the first nav item. */}
      <SidebarHeader className="border-sidebar-border border-b pb-3">
        {/* A wordmark, not a nav item: it sizes to its own two lines rather
            than to a menu row, so it does not sit in an oversized box. */}
        <Link
          href="/dashboard"
          className="hover:bg-sidebar-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 leading-tight transition-colors"
        >
          {/* Glyph: --sidebar is the same green as the tile's own ground, so
              the tile variant would either disappear into it or, if that token
              changed, show up as a square nobody asked for. */}
          <BrandMark size={32} variant="glyph" className="shrink-0" />
          {/* Two lines, so the name can hold text-base inside the ~10rem left
              beside the glyph — on one line that width forces text-sm, and a
              larger single line would truncate to "Jeppiaar Educi…".

              An earlier pass set this on one line because "Jeppiaar Educity"
              over a bare "LMS" left the second line dangling. That still
              applies to a plain stack, so "LMS" is not a bare repeat of the
              wordmark here: it is demoted to a caption — smaller, lighter,
              wide-tracked — which reads as a descriptor of the name above it
              rather than as an orphaned third word. */}
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
              {/* Opens on arriving anywhere under /books, so the category you
                  are filtered to stays visible instead of collapsing on
                  navigation. See the note on booksOpen for why this is
                  controlled rather than defaultOpen. */}
              <Collapsible
                open={booksOpen}
                onOpenChange={setBooksOpen}
                className="group/collapsible"
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      tooltip="Books"
                      // The header highlights only on /books itself; a child
                      // filter highlights the child instead, or two rows would
                      // claim to be current at once.
                      isActive={isActive("/books") && !activeCategory}
                    >
                      <LibraryBigIcon />
                      <span>Books</span>
                      <ChevronDownIcon className="ml-auto transition-transform duration-200 group-data-panel-open/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  }
                />
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {BOOK_LINKS.map((link) => (
                      <SidebarMenuSubItem key={link.url}>
                        <SidebarMenuSubButton
                          isActive={isBookLinkActive(link.url)}
                          render={<Link href={link.url}>{link.title}</Link>}
                        />
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>

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

              {/* Beside Settings rather than in Manage: this changes the
                  signed-in librarian's own credentials, not anything the
                  library owns. Resetting a MEMBER's password is a different
                  action and lives on the member's own page. */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Password"
                  isActive={isActive("/password")}
                  render={
                    <Link href="/password">
                      <KeyRoundIcon />
                      <span>Password</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* A rule above the account row: without it the footer floats and the
          nav list has no visible end, so nothing says the row is a control
          rather than a caption. */}
      <SidebarFooter className="border-sidebar-border border-t">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
