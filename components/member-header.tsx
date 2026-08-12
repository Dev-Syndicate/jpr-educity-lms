"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TITLES: Record<string, string> = {
  "/my": "My books",
  "/my/history": "History",
  "/my/catalogue": "Catalogue",
  "/my/status": "Account status",
  "/my/password": "Change password",
};

/**
 * No breadcrumbs here, unlike the librarian header: the member portal is a
 * handful of flat pages with no nesting, so a trail would always be one item
 * long.
 */
export function MemberHeader() {
  const pathname = usePathname();

  // /my/catalogue/<id> is the one nested route. It keeps the parent's title
  // rather than falling through to "Library", which would read as though the
  // member had left the catalogue — the page itself names the book, and the
  // page has its own Back link.
  const title =
    TITLES[pathname] ??
    (pathname.startsWith("/my/catalogue/") ? TITLES["/my/catalogue"] : "Library");

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  );
}
