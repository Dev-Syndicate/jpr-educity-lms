import Link from "next/link";
import { redirect } from "next/navigation";

import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { getCurrentUser, homePathFor } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { RegisterForm } from "./register-form";

export const metadata = { title: "Register" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));

  // The real gate is inside register_member(); this only avoids showing a form
  // that could never succeed.
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("public_registration")
    .eq("id", 1)
    .single();

  if (!settings?.public_registration) {
    return (
      <Empty className="mx-auto w-full max-w-sm">
        <EmptyTitle>Registration is closed</EmptyTitle>
        <EmptyDescription className="text-balance">
          Accounts are created at the library counter. Bring your college ID and
          a librarian will set you up.
        </EmptyDescription>
        <Link href="/login" className="text-primary text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </Empty>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1 text-center lg:text-left">
        <h1 className="text-2xl font-semibold tracking-tight">
          Apply for a library account
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          Fill this in, then come to the counter with your college ID to be
          approved.
        </p>
      </div>

      <RegisterForm />

      <p className="text-muted-foreground text-center text-sm">
        Already registered?{" "}
        <Link href="/login" className="text-primary underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
