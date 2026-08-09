import { redirect } from "next/navigation";

import { getCurrentUser, homePathFor } from "@/lib/dal";

/**
 * Entry point. Sends each user where they belong; proxy.ts has already
 * bounced anonymous visitors to /login before this runs.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homePathFor(user));
}
