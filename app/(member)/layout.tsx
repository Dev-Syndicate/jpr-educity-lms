import Link from "next/link";
import { Suspense } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/dal";

/**
 * Member shell. Read-only by design: no control here may mutate anything.
 */
export default function MemberLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="bg-brand-deep text-brand-deep-foreground">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/my" className="flex flex-col leading-tight">
            <span className="text-gold text-[0.65rem] font-semibold tracking-[0.2em] uppercase">
              Jeppiaar Educity
            </span>
            <span className="text-sm font-semibold">Library</span>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-1">
            <Link
              href="/my"
              className="hover:bg-sidebar-accent rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              My books
            </Link>
            <Link
              href="/my/catalogue"
              className="hover:bg-sidebar-accent rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              Catalogue
            </Link>
          </nav>

          <Suspense fallback={<Skeleton className="h-8 w-28" />}>
            <MemberBadge />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-6">{children}</main>
    </div>
  );
}

async function MemberBadge() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm opacity-90">{user.fullName}</span>
      <SignOutButton />
    </div>
  );
}
