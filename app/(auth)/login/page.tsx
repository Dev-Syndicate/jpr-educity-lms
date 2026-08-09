import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, homePathFor } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Jeppiaar Educity Library" };

export default async function LoginPage(props: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));

  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  // Only show the registration link when registration is actually open. The
  // real gate is inside register_member(); this just avoids a dead end.
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("public_registration")
    .eq("id", 1)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center lg:text-left">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Use the email address registered with the library.
        </p>
      </div>

      <LoginForm next={nextPath} />

      {settings?.public_registration ? (
        <p className="text-muted-foreground text-center text-sm">
          New here?{" "}
          <Link
            href="/register"
            className="text-primary underline underline-offset-4"
          >
            Register
          </Link>
        </p>
      ) : (
        <p className="text-muted-foreground text-center text-sm text-balance">
          Accounts are created at the library counter.
        </p>
      )}
    </div>
  );
}
