import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/types";

/**
 * THE SECURITY BOUNDARY.
 *
 * Call one of these at the top of every page and every Server Action.
 *
 * A check in a layout does NOT count: layouts do not re-run on client-side
 * navigation, and they do not stop a nested page from rendering. The database
 * (RLS + the security-definer RPCs) is the ultimate authority; this layer
 * stops unauthorised work reaching it and gives the user a sensible redirect.
 */

/**
 * cache() dedupes per render pass, so calling this in a layout, three
 * components and a Server Action costs one getUser() and one profile query.
 * It is NOT a cross-request cache.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  // getUser(), never getSession(). getSession decodes the JWT locally without
  // verifying it, so it can be forged.
  //
  // These two network calls are started together rather than awaited in
  // sequence, which on Vercel — where the function and the database sit in
  // different regions — halves the latency of every page load.
  //
  // current_profile() resolves auth.uid() inside Postgres rather than taking an
  // id from getUser(), which is what removes the dependency between the two
  // calls. A plain select could not do this: a librarian's RLS
  // (profiles_select_librarian) can read EVERY profile, so the id filter is
  // what confines the query to their own row — and knowing that id is exactly
  // what would have cost the extra round trip.
  const [
    {
      data: { user },
      error,
    },
    { data: profile },
  ] = await Promise.all([
    supabase.auth.getUser(),
    // No .single(): the function returns a single composite row, not a set,
    // so PostgREST already yields one object.
    supabase.rpc("current_profile"),
  ]);

  // The auth check still gates everything — an unverified token means no user,
  // whatever the profile query returned. The id comparison then makes sure the
  // row we fetched really is the verified user's.
  if (error || !user) return null;
  if (!profile || profile.id !== user.id) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    memberType: profile.member_type,
    accountStatus: profile.account_status,
    rollNumber: profile.roll_number,
    isActive: profile.is_active,
  };
});

/** Signed in, whatever the role or status. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * An active librarian. Use at the top of every librarian page and EVERY
 * librarian Server Action — a page check does not protect the actions on it.
 */
export async function requireLibrarian(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role !== "librarian" || !user.isActive) redirect("/my");

  return user;
}

/**
 * An approved member (or a librarian viewing member screens).
 * Pending and rejected accounts are sent to the status page instead.
 */
export async function requireApprovedMember(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role === "librarian") return user;
  if (user.accountStatus !== "active" || !user.isActive) redirect("/my/status");

  return user;
}

/** Where a user belongs after signing in. */
export function homePathFor(user: CurrentUser): string {
  if (user.role === "librarian") return "/dashboard";
  if (user.accountStatus !== "active" || !user.isActive) return "/my/status";
  return "/my";
}
