import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/dal";

export const metadata = { title: "Account status" };

/**
 * Where pending and rejected accounts land. A pending member can sign in but
 * sees nothing else — no catalogue, no loans — until a librarian approves
 * them at the counter.
 */
export default async function StatusPage() {
  const user = await requireUser();

  if (user.role === "librarian") redirect("/dashboard");
  if (user.accountStatus === "active" && user.isActive) redirect("/my");

  const rejected = user.accountStatus === "rejected" || !user.isActive;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <Badge
          className={
            rejected
              ? "bg-overdue-subtle text-overdue w-fit"
              : "bg-pending-subtle text-pending w-fit"
          }
        >
          {rejected ? "Not approved" : "Awaiting approval"}
        </Badge>
        <CardTitle className="mt-2">
          {rejected ? "This account cannot borrow" : "Your registration is being reviewed"}
        </CardTitle>
        <CardDescription>
          {user.fullName}
          {user.rollNumber ? ` · ${user.rollNumber}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
        {rejected ? (
          <p>
            Please visit the library counter with your college ID card to sort
            this out.
          </p>
        ) : (
          <>
            <p>
              Bring your college ID card and the book you want to borrow to the
              library counter. The librarian will confirm your details and
              approve your account there.
            </p>
            <p>You can borrow as soon as that is done — there is nothing to do here.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
