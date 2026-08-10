"use client";

import { KeyRoundIcon } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { FormFeedback } from "@/components/form-feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resetMemberPassword } from "@/lib/actions/members";
import { idleState } from "@/lib/types";

/**
 * Reset a member's password from the counter.
 *
 * Confirmed first: this immediately invalidates the password the member is
 * currently using, so doing it by a stray click would lock someone out of
 * their account with no warning.
 *
 * The new password is shown once, afterwards, to be read out or written down.
 * It cannot be retrieved later — only replaced by resetting again.
 */
export function MemberPasswordReset({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [state, action, pending] = useActionState(resetMemberPassword, idleState);
  const [confirming, setConfirming] = useState(false);

  function reset() {
    const fd = new FormData();
    fd.set("memberId", memberId);
    // Closed here rather than in an effect watching the result: the librarian
    // has already confirmed, so the dialog has done its job and should not sit
    // over the panel that is about to show the new password. Doing it in an
    // effect would also be the set-state-in-effect anti-pattern.
    setConfirming(false);
    startTransition(() => action(fd));
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger
          render={
            <Button variant="outline" disabled={pending}>
              {pending ? <Spinner /> : <KeyRoundIcon />}
              Reset password
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this password?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberName} will be signed out of the password they have now, and
              can only get back in with the new one. Make sure they are here to
              be told it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reset} disabled={pending}>
              {pending ? <Spinner /> : null}
              Reset password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The password itself, once. Kept on the page rather than in a toast:
          a toast times out, and this is being copied onto a slip of paper. */}
      {state.ok && state.data ? (
        <div className="bg-available-subtle text-available flex flex-col gap-1 rounded-lg p-4 text-sm">
          <p className="font-semibold">Give this to {memberName} now.</p>
          <p className="font-mono text-base">{state.data.password}</p>
          <p className="opacity-80">
            It is not stored in readable form and cannot be shown again. They can
            change it under Password once signed in.
          </p>
        </div>
      ) : null}

      {/* successToastOnly: a failure shows inline here, while the success
          message goes to a toast — the panel above is the real confirmation
          and an alert repeating it would just push it down. */}
      <FormFeedback state={state} successToastOnly />
    </div>
  );
}
