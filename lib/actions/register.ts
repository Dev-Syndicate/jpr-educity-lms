"use server";

import { z } from "zod";

import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";

/**
 * Public self-registration.
 *
 * This is the ONLY unauthenticated write path in the system, so nothing here
 * is trusted:
 *
 *   * The registration toggle is checked inside register_member(), not here —
 *     a closed library must refuse even a hand-crafted request.
 *   * role and account_status are hard-coded in SQL, never sent from here.
 *   * memberType is stored as declared_member_type: a CLAIM, verified by a
 *     librarian at the counter before the account can borrow anything.
 *
 * The applicant lands in `pending` and cannot borrow until approved.
 */
const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your full name.").max(200),
    email: z.email("Enter a valid email address.").trim().toLowerCase(),
    rollNumber: z.string().trim().min(1, "Enter your roll or staff number.").max(50),
    memberType: z.enum(["student", "staff"]),
    department: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

export async function registerMember(
  _prev: ActionState<{ email: string }>,
  formData: FormData,
): Promise<ActionState<{ email: string }>> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    rollNumber: formData.get("rollNumber"),
    memberType: formData.get("memberType"),
    department: formData.get("department") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  const supabase = await createClient();

  // Cheap pre-check so a closed library rejects before an auth user exists.
  // register_member() checks this again — that check is the real one.
  const { data: settings } = await supabase
    .from("settings")
    .select("public_registration")
    .eq("id", 1)
    .single();

  if (!settings?.public_registration) {
    return failure("Registration is closed. Please visit the library counter.");
  }

  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (signUpError) {
    const raw = signUpError.message ?? "";

    // Sign-ups are switched off at the Supabase auth provider, which the
    // in-app toggle cannot override. Nothing the applicant types will help,
    // so do not blame a field — say where to go instead.
    if (/signups? not allowed|signup is disabled/i.test(raw)) {
      return failure(
        "Registration is not available online. Please visit the library counter to open an account.",
      );
    }

    // An address already in use is genuinely about the email field.
    if (/already registered|already exists|user already/i.test(raw)) {
      return failure("That email address is already registered.", {
        email: ["Already registered. Try signing in instead."],
      });
    }

    if (/password/i.test(raw)) {
      return failure(raw, { password: [raw] });
    }

    console.error("[register]", signUpError.code, raw);
    return failure("Could not complete registration. Please try again.");
  }

  if (!signUp.user) {
    return failure("Could not complete registration. Please try again.");
  }

  // handle_new_user() has already made a bare profile row; this fills in the
  // declared details and stamps it pending.
  const { error } = await supabase.rpc("register_member", {
    p_user_id: signUp.user.id,
    p_full_name: parsed.data.fullName,
    p_roll_number: parsed.data.rollNumber,
    p_department: parsed.data.department ?? "",
    p_declared_member_type: parsed.data.memberType,
    p_phone: parsed.data.phone || undefined,
  });

  if (error) {
    // The auth user exists but has no usable profile. Sign out so the browser
    // is not left holding a session for a half-made account; the person can
    // finish at the counter, where a librarian can see the row.
    await supabase.auth.signOut();
    return failure(rpcErrorMessage(error, "Could not complete registration."));
  }

  return success({ email: parsed.data.email }, "Registration received.");
}
