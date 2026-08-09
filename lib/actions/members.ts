"use server";

import { refresh, revalidatePath } from "next/cache";
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
      // Active before pending, then alphabetical. Capped: a two-letter query
      // against a few hundred members would otherwise return most of them,
      // and nobody picks a person out of a list that long — they type more.
      .order("account_status")
      .order("full_name")
      .limit(20),
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

// ---------------------------------------------------------------------------
// Account creation (service role) and profile editing.
// ---------------------------------------------------------------------------

const createSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required.").max(200),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  rollNumber: z.string().trim().min(1, "Roll or staff number is required.").max(50),
  memberType: z.enum(["student", "staff"]),
  department: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8, "Use at least 8 characters."),
});

export async function createMember(
  _prev: ActionState<{ email: string; password: string }>,
  formData: FormData,
): Promise<ActionState<{ email: string; password: string }>> {
  // Never skip: this action wraps the service-role key.
  await requireLibrarian();

  const parsed = createSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    rollNumber: formData.get("rollNumber"),
    memberType: formData.get("memberType"),
    department: formData.get("department") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true, // no SMTP configured; skip the verification round trip
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (authError) {
    return failure(authError.message, { email: [authError.message] });
  }

  // handle_new_user() already created a pending profile; fill in the real
  // values and activate, since a librarian is vouching for this person.
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      roll_number: parsed.data.rollNumber,
      member_type: parsed.data.memberType,
      department: parsed.data.department || null,
      phone: parsed.data.phone || null,
      role: "member",
      account_status: "active",
      is_active: true,
    })
    .eq("id", created.user.id);

  if (error) {
    // Roll back the auth user, or the email is claimed by a broken account.
    await admin.auth.admin.deleteUser(created.user.id);
    if (error.code === "23505") {
      return failure("That roll number is already registered.", {
        rollNumber: ["Already in use."],
      });
    }
    return failure(rpcErrorMessage(error, "Could not create that member."));
  }

  revalidatePath("/members");
  return success(
    { email: parsed.data.email, password: parsed.data.password },
    `${parsed.data.fullName} can now borrow books.`,
  );
}

const updateSchema = z.object({
  memberId: z.uuid(),
  fullName: z.string().trim().min(1, "Name is required.").max(200),
  rollNumber: z.string().trim().min(1, "Roll or staff number is required.").max(50),
  memberType: z.enum(["student", "staff"]),
  department: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
});

export async function updateMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const parsed = updateSchema.safeParse({
    memberId: formData.get("memberId"),
    fullName: formData.get("fullName"),
    rollNumber: formData.get("rollNumber"),
    memberType: formData.get("memberType"),
    department: formData.get("department") ?? undefined,
    phone: formData.get("phone") ?? undefined,
  });

  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      roll_number: parsed.data.rollNumber,
      member_type: parsed.data.memberType,
      department: parsed.data.department || null,
      phone: parsed.data.phone || null,
    })
    .eq("id", parsed.data.memberId);

  if (error) {
    if (error.code === "23505") {
      return failure("That roll number is already in use.", {
        rollNumber: ["Already in use."],
      });
    }
    return failure(rpcErrorMessage(error, "Could not save those changes."));
  }

  refresh();
  return success(undefined, "Saved.");
}

export async function setMemberActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const memberId = String(formData.get("memberId") ?? "");
  const active = formData.get("active") === "true";

  if (!z.uuid().safeParse(memberId).success) return failure("That member no longer exists.");

  const supabase = await createClient();

  // Deactivating someone still holding books would strand those loans.
  if (!active) {
    const { count } = await supabase
      .from("loans")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId)
      .is("returned_at", null);

    if ((count ?? 0) > 0) {
      return failure(
        `They still have ${count} book(s) issued. Collect those before deactivating.`,
      );
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", memberId);

  if (error) return failure(rpcErrorMessage(error, "Could not update that member."));

  refresh();
  return success(undefined, active ? "Member reactivated." : "Member deactivated.");
}

export async function approveMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const parsed = z
    .object({
      memberId: z.uuid(),
      memberType: z.enum(["student", "staff"]).optional(),
    })
    .safeParse({
      memberId: formData.get("memberId"),
      memberType: formData.get("memberType") ?? undefined,
    });

  if (!parsed.success) return failure("Could not approve that registration.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("approve_member", {
      p_profile_id: parsed.data.memberId,
      p_member_type: parsed.data.memberType ?? undefined,
    })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not approve that registration."));

  refresh();
  return success(undefined, `${data.member_name} can now borrow books.`);
}
