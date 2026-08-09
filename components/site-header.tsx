"use client";

import { ScanBarcodeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/counter": "Counter",
  "/loans": "Loans",
  "/fines": "Fines",
  "/books": "Books",
  "/members": "Members",
  "/registrations": "Registrations",
  "/settings": "Settings",
};

export function SiteHeader() {
  const pathname = usePathname();

  const title =
    TITLES[pathname] ??
    Object.entries(TITLES).find(([path]) => pathname.startsWith(`${path}/`))?.[1] ??
    "Library";

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>

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
