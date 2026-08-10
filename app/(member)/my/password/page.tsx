import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/dal";

import { PasswordForm } from "./password-form";

export const metadata = { title: "Password" };

/**
 * Change your own password.
 *
 * requireUser(), not requireApprovedMember(): a pending member was handed a
 * temporary password at the counter and should be able to replace it while
 * they wait for approval. The action re-checks the session itself, so this is
 * not the only guard.
 */
export default async function PasswordPage() {
  const user = await requireUser();

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Signed in as {user.email}. You will stay signed in after changing it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordForm />
      </CardContent>
    </Card>
  );
}
