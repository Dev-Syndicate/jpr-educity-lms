"use client";

import { ScanBarcodeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Top-level sections, by their first path segment. */
const SECTIONS: Record<string, string> = {
  dashboard: "Dashboard",
  counter: "Counter",
  loans: "Loans",
  fines: "Fines",
  books: "Books",
  members: "Members",
  staff: "Librarians",
  settings: "Settings",
};

/** Trailing segments that name an action rather than a record. */
const ACTIONS: Record<string, string> = {
  new: "Add",
  edit: "Edit",
};

/** What a record is called in each section, for the id crumb. */
const RECORDS: Record<string, string> = {
  books: "Book",
  members: "Member",
};

type Crumb = { label: string; href?: string };

/**
 * Breadcrumbs from the path alone.
 *
 * A record's own name is not available here — this is a client component and
 * an id in the URL is just an id — so a detail page shows "Details" rather
 * than the title. The crumb still does the job that matters: it makes the
 * parent list one click away instead of leaving the header saying "Books" on
 * a page that is not the book list.
 */
function crumbsFor(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return [{ label: "Library" }];

  const section = SECTIONS[parts[0]];
  if (!section) return [{ label: "Library" }];

  const crumbs: Crumb[] = [{ label: section, href: `/${parts[0]}` }];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const action = ACTIONS[part];

    if (action) {
      crumbs.push({ label: action });
      continue;
    }

    // An id segment. The record's own name is not knowable here, so it takes
    // the singular of its section — "Book", not the title, which the page
    // heading already shows.
    const href = `/${parts.slice(0, i + 1).join("/")}`;
    crumbs.push({
      label: RECORDS[parts[0]] ?? "Details",
      href: i < parts.length - 1 ? href : undefined,
    });
  }

  // The last crumb is where you are, so it is never a link.
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;

  return crumbs;
}

export function SiteHeader() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />

        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => (
              // Separator between items, not inside one, or the trail ends
              // with a dangling chevron.
              <React.Fragment key={`${crumb.label}-${i}`}>
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        {pathname !== "/counter" ? (
          // nativeButton={false}: the rendered element is an <a>, not a
          // <button>. Without it Base UI warns about lost button semantics.
          <Button
            className="ml-auto"
            nativeButton={false}
            render={
              <Link href="/counter">
                <ScanBarcodeIcon />
                Counter
              </Link>
            }
          />
        ) : null}
      </div>
    </header>
  );
}
