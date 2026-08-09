import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Only for creating auth users (librarians adding members or other
 * librarians). Never import this from a Client Component — `server-only`
 * makes that a build error.
 *
 * Three layers keep the key out of the browser:
 *   1. no NEXT_PUBLIC_ prefix, so Next never inlines it
 *   2. `import "server-only"` fails the build on any client import
 *   3. it is only called from "use server" modules
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Copy .env.example to .env.local.",
    );
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
