import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { MemberForm } from "../../member-form";

export const metadata = { title: "Edit member" };

export default async function EditMemberPage(props: PageProps<"/members/[id]/edit">) {
  await requireLibrarian();
  const { id } = await props.params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, roll_number, member_type, department, phone, address",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/members/${data.id}`} label={data.full_name} />
        <h2 className="text-xl font-semibold tracking-tight">Edit member</h2>
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
          address: data.address,
        }}
      />
    </div>
  );
}
