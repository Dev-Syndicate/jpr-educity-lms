import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/dal";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/counter", label: "Counter" },
  { href: "/books", label: "Books" },
  { href: "/members", label: "Members" },
  { href: "/loans", label: "Loans" },
  { href: "/fines", label: "Fines" },
  { href: "/settings", label: "Settings" },
];

/**
 * Deliberately NOT async and NOT calling the DAL.
 *
 * Awaiting cookies() here would stall streaming for the whole segment, and a
 * layout check is not a security boundary anyway — it does not re-run on
 * client-side navigation. Each page and action calls requireLibrarian().
 */
export default function LibrarianLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-brand-deep text-brand-deep-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/dashboard" className="flex flex-col leading-tight">
            <span className="text-gold text-[0.65rem] font-semibold tracking-[0.2em] uppercase">
              Jeppiaar Educity
            </span>
            <span className="text-sm font-semibold">Library</span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:bg-sidebar-accent rounded-md px-3 py-1.5 text-sm transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Suspense fallback={<Skeleton className="h-8 w-32" />}>
            <UserBadge />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
    </div>
  );
}

async function UserBadge() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm opacity-90">{user.fullName}</span>
      <SignOutButton />
    </div>
  );
}
