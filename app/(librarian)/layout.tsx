import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/dal";

/**
 * The sidebar needs the user's name, so this layout does await the DAL.
 *
 * That check is a convenience, NOT a security boundary — layouts do not re-run
 * on client-side navigation and do not stop a nested page rendering. Every
 * page below still calls requireLibrarian(), and every Server Action does too.
 */
export default async function LibrarianLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role !== "librarian" || !user.isActive) redirect("/my");

  return (
    /*
     * --sidebar-width 60 = 15rem. The floor is the wordmark beside the 30px
     * glyph, not the nav labels — "Non-book material" is the longest of those
     * and still clears the indent under Books.
     */
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 60)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
