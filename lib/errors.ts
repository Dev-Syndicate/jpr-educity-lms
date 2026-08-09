import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Turn a Postgres error into something a librarian can act on.
 *
 * The RPCs raise exceptions with messages written for the counter
 * ("Arun already has 3 books issued"). Supabase surfaces those as P0001 with
 * the text intact. Those are author-controlled, so they are safe to show
 * verbatim — anything else could leak schema details, so it gets a generic
 * message and a server-side log.
 */
export function rpcErrorMessage(
  error: PostgrestError | { code?: string; message?: string },
  fallback = "Something went wrong. Please try again.",
): string {
  const code = "code" in error ? error.code : undefined;
  const message = error.message ?? "";

  // raise_exception — our own, deliberately worded messages.
  if (code === "P0001") return message;

  // no_data_found / too_many_rows from a strict SELECT INTO.
  if (code === "P0002" || code === "P0003") {
    return message || "That record no longer exists.";
  }

  if (code === "23505") return "That value is already in use.";
  if (code === "23503") return "That record is still referenced elsewhere.";
  if (code === "42501") return "You do not have permission to do this.";

  console.error("[rpc]", code, message);
  return fallback;
}

/**
 * Supabase Auth errors. Deliberately vague on sign-in failures: saying which
 * of email or password was wrong tells an attacker which accounts exist.
 */
export function authErrorMessage(error: { message?: string; code?: string }) {
  const raw = error.message ?? "";

  if (/invalid login credentials/i.test(raw)) {
    return "Incorrect email or password.";
  }
  if (/email not confirmed/i.test(raw)) {
    return "This account has not been confirmed yet. Ask a librarian.";
  }
  if (/rate limit|too many/i.test(raw)) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  console.error("[auth]", error.code, raw);
  return "Could not sign you in. Please try again.";
}
