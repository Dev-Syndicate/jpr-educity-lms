import { redirect } from "next/navigation";

import { MemberHeader } from "@/components/member-header";
import { MemberSidebar } from "@/components/member-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/dal";

/**
 * Member shell. Read-only by design: no control here may mutate anything.
 *
 * The sidebar needs the user's name, so this layout does await the DAL. That
 * check is a convenience, NOT a security boundary — layouts do not re-run on
 * client-side navigation. Every page below calls requireApprovedMember().
 */
export default async function MemberLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <MemberSidebar variant="inset" user={user} />
      <SidebarInset>
        <MemberHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
