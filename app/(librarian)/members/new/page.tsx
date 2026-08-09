import { BackLink } from "@/components/back-link";
import { requireLibrarian } from "@/lib/dal";

import { MemberForm } from "../member-form";

export const metadata = { title: "Add member · Jeppiaar Educity Library" };

export default async function NewMemberPage() {
  await requireLibrarian();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/members" label="Members" />
        <h2 className="text-xl font-semibold tracking-tight">Add a member</h2>
        <p className="text-muted-foreground text-sm">
          They can borrow immediately — no approval step for accounts you create.
        </p>
      </div>
      <MemberForm />
    </div>
  );
}
