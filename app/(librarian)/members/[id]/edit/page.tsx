import { notFound } from "next/navigation";

import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { MemberForm } from "../../member-form";

export const metadata = { title: "Edit member · Jeppiaar Educity Library" };

export default async function EditMemberPage(props: PageProps<"/members/[id]/edit">) {
  await requireLibrarian();
  const { id } = await props.params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, roll_number, member_type, department, phone")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Edit member</h2>
        <p className="text-muted-foreground text-sm">{data.full_name}</p>
      </div>
      <MemberForm
        member={{
          id: data.id,
          fullName: data.full_name,
          email: data.email,
          rollNumber: data.roll_number,
          memberType: data.member_type,
          department: data.department,
          phone: data.phone,
        }}
      />
    </div>
  );
}
