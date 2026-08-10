"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { authErrorMessage, rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";
import type { AccountStatus, MemberType } from "@/lib/types";

/** Matches the bucket's allowed_mime_types — the bucket is the real check. */
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Upload a member's photo and return its object path, or null.
 *
 * Named `<uuid>.<ext>` so the owning member is derivable from the filename —
 * that is what lets the storage policy compare it to auth.uid() and let a
 * member read their own photo and nobody else's.
 *
 * Returns null rather than throwing on a bad or failed upload. A photo is
 * optional, and losing an otherwise-valid member because their JPEG did not
 * land would be a worse outcome than a member with no picture; the librarian
 * can add one from the edit form. Genuinely invalid files are rejected by the
 * form and by the bucket before reaching here.
 */
async function uploadMemberPhoto(
  memberId: string,
  file: FormDataEntryValue | null,
): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;

  const extension = PHOTO_TYPES[file.type];
  if (!extension || file.size > PHOTO_MAX_BYTES) return null;

  const path = `${memberId}.${extension}`;

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { error } = await admin.storage
    .from("member-photos")
    // upsert: re-uploading replaces the member's photo rather than erroring,
    // and keeps one object per member instead of accumulating orphans.
    .upload(path, file, { upsert: true, contentType: file.type });

  return error ? null : path;
}

export type MemberHit = {
  id: string;
  fullName: string;
  rollNumber: string | null;
  department: string | null;
  email: string;
  phone: string | null;
  /**
   * Short-lived signed URL, or null. The bucket is private, so this cannot be
   * a bare path — see the signing below.
   */
  photoUrl: string | null;
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
        "id, full_name, roll_number, department, email, phone, photo_path, member_type, declared_member_type, account_status, is_active",
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

  const paths = rows.map((r) => r.photo_path).filter((p) => p !== null);

  // Both depend on `rows`, so neither can start earlier — but they must not
  // wait on each other either.
  const [{ data: dues }, signed] = await Promise.all([
    // Per-member loan counts and dues in one round trip rather than N.
    supabase
      .from("v_member_dues")
      .select("member_id, books_out, total_outstanding")
      .in(
        "member_id",
        rows.map((r) => r.id),
      ),
    // createSignedUrls, not createSignedUrl in a loop: 20 hits would be 20
    // round trips to sign, on the keystroke path. Skipped entirely when
    // nobody in the result set has a photo.
    paths.length
      ? supabase.storage.from("member-photos").createSignedUrls(paths, 60 * 10)
      : Promise.resolve({ data: null }),
  ]);

  const byMember = new Map(dues?.map((d) => [d.member_id, d]) ?? []);

  // Keyed by path, since that is all the signing response echoes back.
  const urlByPath = new Map(
    signed.data
      ?.filter((s) => s.path && s.signedUrl)
      .map((s) => [s.path as string, s.signedUrl]) ?? [],
  );

  return rows.map((row) => {
    const d = byMember.get(row.id);
    const type = row.member_type ?? row.declared_member_type;

    return {
      id: row.id,
      fullName: row.full_name,
      rollNumber: row.roll_number,
      department: row.department,
      email: row.email,
      phone: row.phone,
      photoUrl: row.photo_path ? (urlByPath.get(row.photo_path) ?? null) : null,
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
  address: z.string().trim().max(500, "Keep the address under 500 characters.").optional(),
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
    address: formData.get("address") ?? undefined,
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
      address: parsed.data.address || null,
      // Uploaded below: the object is named after the member's uuid, which
      // does not exist until the auth user above has been created.
      photo_path: await uploadMemberPhoto(created.user.id, formData.get("photo")),
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
  address: z.string().trim().max(500, "Keep the address under 500 characters.").optional(),
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
    address: formData.get("address") ?? undefined,
  });

  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  // Only set when a new file was actually chosen: an untouched file input
  // submits an empty File, and writing null there would silently delete the
  // photo every time someone edited a phone number.
  const uploadedPath = await uploadMemberPhoto(
    parsed.data.memberId,
    formData.get("photo"),
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      roll_number: parsed.data.rollNumber,
      member_type: parsed.data.memberType,
      department: parsed.data.department || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      ...(uploadedPath ? { photo_path: uploadedPath } : {}),
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

/**
 * A readable temporary password.
 *
 * Generated, never librarian-chosen: a human picking one at the counter all
 * day converges on the same string for everybody, and it is read aloud or
 * written on a slip, so it has to survive being transcribed. Ambiguous
 * characters (O/0, I/l/1) are left out for the same reason.
 *
 * crypto.randomUUID is not used — this is spoken, not stored.
 */
function temporaryPassword(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L, O
  const digits = "23456789"; // no 0, 1
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);

  const word = Array.from({ length: 4 }, (_, i) =>
    letters[bytes[i] % letters.length],
  ).join("");
  const number = Array.from({ length: 4 }, (_, i) =>
    digits[bytes[i + 4] % digits.length],
  ).join("");

  // Mixed case + digits, so it satisfies any password policy Supabase applies.
  return `Lib-${word}-${number}`;
}

/**
 * Reset a member's password to a fresh temporary one.
 *
 * For the counter: the login screen tells a member who has forgotten their
 * password to come and ask, and this is what the librarian does when they do.
 * No email is involved, which matters because no SMTP is configured.
 *
 * The new password is returned ONCE, to be read out or written down, exactly
 * like the create-member flow. It is not stored anywhere in readable form.
 */
export async function resetMemberPassword(
  _prev: ActionState<{ password: string }>,
  formData: FormData,
): Promise<ActionState<{ password: string }>> {
  // Never skip: this action wraps the service-role key.
  await requireLibrarian();

  const memberId = String(formData.get("memberId") ?? "");
  if (!z.uuid().safeParse(memberId).success) {
    return failure("That member no longer exists.");
  }

  const supabase = await createClient();

  // Confirm the target is a MEMBER before touching their credentials.
  //
  // Without this a librarian could reset another librarian's password and take
  // over their account — the service-role client below bypasses RLS, so this
  // check is the only thing standing in the way. A librarian who forgets their
  // own password is handled by a second librarian in the Supabase dashboard,
  // deliberately a heavier path.
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", memberId)
    .maybeSingle();

  if (!target) return failure("That member no longer exists.");
  if (target.role !== "member") {
    return failure("Only member passwords can be reset here.");
  }

  const password = temporaryPassword();

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(memberId, { password });

  if (error) return failure(authErrorMessage(error));

  refresh();
  return success(
    { password },
    `New password set for ${target.full_name}. Give it to them now.`,
  );
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

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

/** Column names the template uses. Only the first four are required. */
const IMPORT_COLUMNS = [
  "full_name",
  "email",
  "roll_number",
  "member_type",
  "department",
  "phone",
  "address",
] as const;

export type ImportFailure = {
  /** 1-based line in the file as opened in a spreadsheet, header included. */
  line: number;
  name: string;
  reason: string;
};

export type ImportResult = {
  created: number;
  failures: ImportFailure[];
};

const importRowSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.email("Not a valid email address.").trim().toLowerCase(),
  roll_number: z.string().trim().min(1, "Roll or staff number is required.").max(50),
  member_type: z
    .string()
    .trim()
    .toLowerCase()
    // "Student"/"Faculty" is what a librarian types; both spellings map on.
    .transform((v) => (v === "faculty" ? "staff" : v))
    .pipe(z.enum(["student", "staff"], "Must be student or faculty.")),
  department: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
});

/**
 * Create many members from a CSV file.
 *
 * PARTIAL BY DESIGN. Rows are independent: a duplicate email on line 14 must
 * not cost the other 199 rows, so each is attempted on its own and the
 * failures come back with line numbers to fix and re-upload.
 *
 * Sequential, not Promise.all: these are auth-server calls behind the
 * service-role key, and firing 200 at once invites rate limiting — which
 * would fail rows that are perfectly valid and make the report a lie.
 */
export async function importMembers(
  _prev: ActionState<ImportResult>,
  formData: FormData,
): Promise<ActionState<ImportResult>> {
  // Never skip: this action wraps the service-role key.
  await requireLibrarian();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return failure("Choose a CSV file to import.");
  }

  if (file.size > 2 * 1024 * 1024) {
    return failure("That file is larger than 2 MB. Split it and import in parts.");
  }

  const password = String(formData.get("password") ?? "").trim();
  if (password.length < 8) {
    return failure("The temporary password must be at least 8 characters.", {
      password: ["Use at least 8 characters."],
    });
  }

  const { parseCsvRows } = await import("@/lib/csv");
  const { headers, rows } = parseCsvRows(await file.text());

  if (!rows.length) {
    return failure("That file has no rows below the header.");
  }

  if (rows.length > 500) {
    return failure("Import at most 500 members at a time.");
  }

  // A missing required column is a mistake about the whole file, not about a
  // row, so it stops the import rather than failing 200 rows identically.
  const missing = IMPORT_COLUMNS.slice(0, 4).filter((c) => !headers.includes(c));
  if (missing.length) {
    return failure(
      `The file is missing the ${missing.join(", ")} column${missing.length > 1 ? "s" : ""}. Download the template and match its headers.`,
    );
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const failures: ImportFailure[] = [];
  let created = 0;

  // Catch duplicates WITHIN the file. Two rows sharing an email would
  // otherwise show as a confusing "already registered" on the second.
  const seenEmails = new Set<string>();
  const seenRolls = new Set<string>();

  for (const [index, row] of rows.entries()) {
    // +2: one for the header, one because spreadsheets count from 1.
    const line = index + 2;
    const label = row.full_name || row.email || `row ${line}`;

    const parsed = importRowSchema.safeParse(row);
    if (!parsed.success) {
      failures.push({
        line,
        name: label,
        reason: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
      continue;
    }

    const data = parsed.data;

    if (seenEmails.has(data.email)) {
      failures.push({ line, name: label, reason: "This email appears earlier in the file." });
      continue;
    }
    if (seenRolls.has(data.roll_number.toLowerCase())) {
      failures.push({
        line,
        name: label,
        reason: "This roll number appears earlier in the file.",
      });
      continue;
    }

    const { data: createdUser, error: authError } = await admin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true, // no SMTP configured
      user_metadata: { full_name: data.full_name },
    });

    if (authError || !createdUser?.user) {
      failures.push({
        line,
        name: label,
        reason: authError
          ? authErrorMessage(authError)
          : "Could not create this account.",
      });
      continue;
    }

    const { error } = await admin
      .from("profiles")
      .update({
        full_name: data.full_name,
        email: data.email,
        roll_number: data.roll_number,
        member_type: data.member_type,
        department: data.department || null,
        phone: data.phone || null,
        address: data.address || null,
        role: "member",
        account_status: "active",
        is_active: true,
      })
      .eq("id", createdUser.user.id);

    if (error) {
      // Roll back, or the email is claimed by a half-made account that the
      // librarian cannot fix by re-importing the corrected row.
      await admin.auth.admin.deleteUser(createdUser.user.id);
      failures.push({
        line,
        name: label,
        reason:
          error.code === "23505"
            ? "That roll number is already registered."
            : rpcErrorMessage(error, "Could not save this member."),
      });
      continue;
    }

    seenEmails.add(data.email);
    seenRolls.add(data.roll_number.toLowerCase());
    created += 1;
  }

  revalidatePath("/members");

  const summary =
    failures.length === 0
      ? `Imported ${created} member${created === 1 ? "" : "s"}.`
      : `Imported ${created} of ${rows.length}. ${failures.length} row${failures.length === 1 ? "" : "s"} could not be created.`;

  // Not a failure() even when some rows fail: the good rows really were
  // created, and reporting it as an error would suggest otherwise.
  return success({ created, failures }, summary);
}
