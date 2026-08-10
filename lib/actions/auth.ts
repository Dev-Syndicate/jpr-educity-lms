"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser, homePathFor, requireUser } from "@/lib/dal";
import { authErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";

const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return failure(authErrorMessage(error));

  const user = await getCurrentUser();
  if (!user) return failure("Signed in, but your profile is missing. Ask a librarian.");

  if (!user.isActive) {
    await supabase.auth.signOut();
    return failure("This account has been deactivated. Please visit the library counter.");
  }

  if (user.accountStatus === "rejected") {
    await supabase.auth.signOut();
    return failure("This registration was not approved. Please visit the library counter.");
  }

  // A redirect target from ?next=, but only a local path — an absolute URL
  // here would let a crafted link bounce the user to another site after login.
  const next = parsed.data.next;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  // redirect() throws, so it must be outside the try/catch above.
  redirect(safeNext ?? homePathFor(user));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Repeat the new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "That is your current password. Choose a different one.",
    path: ["newPassword"],
  });

/**
 * Change your own password.
 *
 * The one thing a member may write. It touches their auth account, not any
 * library data, so it does not break the read-only rule the member portal is
 * built on — a member still cannot alter a loan, a fine or their own status.
 *
 * Used by members who were handed a temporary password at the counter, and by
 * librarians changing their own. Anyone signed in can reach it.
 */
export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Signed in, whatever the role or account status: a pending member should
  // still be able to replace the temporary password they were given.
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  const supabase = await createClient();

  // Re-authenticate first. updateUser() changes the password of whoever holds
  // the session WITHOUT checking the old one, so a borrowed unlocked browser
  // would otherwise be enough to lock the real owner out of their account.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });

  if (reauthError) {
    return failure("That is not your current password.", {
      currentPassword: ["That is not your current password."],
    });
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (error) return failure(authErrorMessage(error));

  return success(undefined, "Password changed.");
}
