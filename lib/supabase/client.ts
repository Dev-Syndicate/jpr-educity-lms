"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Client Components.
 *
 * Barely used in this app: members are read-only and every librarian mutation
 * goes through a Server Action. Kept for auth state listeners.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
