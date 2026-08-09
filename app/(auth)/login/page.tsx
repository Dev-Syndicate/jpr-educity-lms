import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser, homePathFor } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Jeppiaar Educity Library" };

export default async function LoginPage(props: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));

  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  // Only show the registration link when registration is actually open —
  // the real gate is inside register_member(), this just avoids a dead end.
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("public_registration")
    .eq("id", 1)
    .single();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use the email address registered with the library.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LoginForm next={nextPath} />

        {settings?.public_registration ? (
          <p className="text-muted-foreground text-center text-sm">
            New here?{" "}
            <a href="/register" className="text-primary underline underline-offset-4">
              Register
            </a>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
