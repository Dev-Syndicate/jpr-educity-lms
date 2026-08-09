import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Next 16: cookies() is async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called during a Server Component render, where setting cookies
            // throws — and TypeScript cannot catch it, because the type
            // structurally includes .set().
            //
            // Safe to swallow ONLY because proxy.ts refreshes the session for
            // every request. Delete the proxy and sessions silently stop
            // refreshing.
          }
        },
      },
    },
  );
}
