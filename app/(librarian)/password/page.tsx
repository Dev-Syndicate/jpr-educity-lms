import { PasswordForm } from "@/components/password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireLibrarian } from "@/lib/dal";

export const metadata = { title: "Change password" };

/**
 * A librarian changing their OWN password.
 *
 * The form and the action are shared with the member portal rather than
 * copied: changePassword() already takes requireUser() and re-authenticates
 * against the caller's own session, so it is role-agnostic by construction —
 * whoever is signed in can change their own credentials and nobody else's.
 * Two copies of a password form would be two places to get re-authentication
 * wrong.
 *
 * This is NOT the same thing as resetMemberPassword() in lib/actions/members,
 * which is how a librarian resets a MEMBER's password at the counter. That one
 * wraps the service-role key and refuses any target whose role is not
 * 'member' — deliberately, so one librarian cannot take over another's
 * account. A librarian who forgets their own password is still handled in the
 * Supabase dashboard.
 *
 * requireLibrarian() here rather than requireUser(): the route lives under the
 * (librarian) group and a member reaching it should be sent to their own
 * /my/password, not shown the librarian shell.
 */
export default async function LibrarianPasswordPage() {
  const user = await requireLibrarian();

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
