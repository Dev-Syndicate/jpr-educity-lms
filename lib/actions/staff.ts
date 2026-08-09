"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";

const createSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required.").max(200),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8, "Use at least 8 characters."),
  confirm: z.literal("GRANT", {
    message: 'Type GRANT to confirm this account gets full access.',
  }),
});

/**
 * Create another librarian.
 *
 * A librarian can do everything — issue, waive fines, change the rules — so
 * this is the most privileged action in the system and deliberately the most
 * awkward: it needs a typed confirmation, not just a click.
 */
export async function createLibrarian(
  _prev: ActionState<{ email: string; password: string }>,
  formData: FormData,
): Promise<ActionState<{ email: string; password: string }>> {
  // Never skip: this action wraps the service-role key.
  await requireLibrarian();

  const parsed = createSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? undefined,
    password: formData.get("password"),
    confirm: formData.get("confirm"),
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
    // proxy.ts reads the role from app_metadata for its optimistic redirect.
    // It lives here, not user_metadata, because user_metadata is
    // self-writable — a member could otherwise promote themselves.
    app_metadata: { role: "librarian" },
  });

  if (authError) {
    return failure(authError.message, { email: [authError.message] });
  }

  // handle_new_user() has already made a pending member profile; promote it.
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      role: "librarian",
      account_status: "active",
      is_active: true,
      // A librarian is not a borrower; leave the member fields empty so they
      // never appear in member lists or count against a borrowing limit.
      member_type: null,
      declared_member_type: null,
      roll_number: null,
    })
    .eq("id", created.user.id);

  if (error) {
    // Roll back the auth user, or the email is claimed by a broken account
    // that can sign in but has no librarian profile.
    await admin.auth.admin.deleteUser(created.user.id);
    return failure(rpcErrorMessage(error, "Could not create that librarian account."));
  }

  revalidatePath("/staff");
  return success(
    { email: parsed.data.email, password: parsed.data.password },
    `${parsed.data.fullName} now has full librarian access.`,
  );
}

/**
 * Activate or deactivate a librarian.
 *
 * Refuses to touch your own account (PRD S-3): a librarian who deactivates
 * themselves is locked out with no way back in, and if they are the last one,
 * so is everybody else.
 */
export async function setLibrarianActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireLibrarian();

  const librarianId = String(formData.get("librarianId") ?? "");
  const active = formData.get("active") === "true";

  if (!z.uuid().safeParse(librarianId).success) {
    return failure("That account no longer exists.");
  }

  if (librarianId === me.id) {
    return failure("You cannot deactivate your own account.");
  }

  const supabase = await createClient();

  // Never leave the library with no way in. Counts only OTHER active
  // librarians, so this is the last-one check even though self is excluded
  // above.
  if (!active) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "librarian")
      .eq("is_active", true)
      .neq("id", librarianId);

    if ((count ?? 0) === 0) {
      return failure("This is the last active librarian. Create another one first.");
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_active: active })
    .eq("id", librarianId)
    .eq("role", "librarian");

  if (error) return failure(rpcErrorMessage(error, "Could not update that account."));

  refresh();
  return success(
    undefined,
    active ? "Librarian reactivated." : "Librarian deactivated.",
  );
}
