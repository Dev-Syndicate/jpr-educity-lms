"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";
import type { AccountStatus, MemberType } from "@/lib/types";

export type MemberHit = {
  id: string;
  fullName: string;
  rollNumber: string | null;
  department: string | null;
  email: string;
  memberType: MemberType | null;
  declaredMemberType: MemberType | null;
  accountStatus: AccountStatus;
  isActive: boolean;
  booksOut: number;
  maxBooks: number;
  owed: number;
};

/**
 * Counter member search. Matches name or roll number, and deliberately
 * INCLUDES pending members — the counter is where they get approved.
 */
export async function searchMembers(query: string): Promise<MemberHit[]> {
  await requireLibrarian();

  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  const [{ data: rows }, { data: settings }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, roll_number, department, email, member_type, declared_member_type, account_status, is_active",
      )
      .eq("role", "member")
      .or(`full_name.ilike.%${q}%,roll_number.ilike.%${q}%`)
      .order("account_status")
      .order("full_name")
      .limit(8),
    supabase
      .from("settings")
      .select("max_books_student, max_books_staff")
      .eq("id", 1)
      .single(),
  ]);

  if (!rows?.length) return [];

  // Per-member loan counts and dues in one round trip rather than N.
  const { data: dues } = await supabase
    .from("v_member_dues")
    .select("member_id, books_out, total_outstanding")
    .in(
      "member_id",
      rows.map((r) => r.id),
    );

  const byMember = new Map(dues?.map((d) => [d.member_id, d]) ?? []);

  return rows.map((row) => {
    const d = byMember.get(row.id);
    const type = row.member_type ?? row.declared_member_type;

    return {
      id: row.id,
      fullName: row.full_name,
      rollNumber: row.roll_number,
      department: row.department,
      email: row.email,
      memberType: type,
      declaredMemberType: row.declared_member_type,
      accountStatus: row.account_status,
      isActive: row.is_active,
      booksOut: Number(d?.books_out ?? 0),
      maxBooks:
        type === "staff"
          ? (settings?.max_books_staff ?? 5)
          : (settings?.max_books_student ?? 3),
      owed: Number(d?.total_outstanding ?? 0),
    };
  });
}

/** Books currently held by a member, for the counter panel. */
export async function memberLoans(memberId: string) {
  await requireLibrarian();

  const supabase = await createClient();
  const { data } = await supabase
    .from("v_loans_with_fine")
    .select(
      "id, book_title, accession_number, due_date, is_overdue, days_overdue, fine_outstanding, renewal_count",
    )
    .eq("member_id", memberId)
    .is("returned_at", null)
    .order("due_date");

  return data ?? [];
}

const rejectSchema = z.object({
  memberId: z.uuid(),
  reason: z.string().trim().max(500).optional(),
});

export async function rejectMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const parsed = rejectSchema.safeParse({
    memberId: formData.get("memberId"),
    reason: formData.get("reason") ?? undefined,
  });

  if (!parsed.success) return failure("Could not reject that registration.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("reject_member", {
      p_profile_id: parsed.data.memberId,
      p_reason: parsed.data.reason || undefined,
    })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not reject that registration."));

  refresh();
  return success(undefined, `${data.member_name}'s registration was rejected.`);
}
