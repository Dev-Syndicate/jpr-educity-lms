"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getCurrentUser, homePathFor } from "@/lib/dal";
import { authErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, type ActionState } from "@/lib/types";

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
