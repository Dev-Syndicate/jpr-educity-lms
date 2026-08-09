"use client";

import { useActionState } from "react";

import { FormFeedback, SubmitButton } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { approveMember, rejectMember } from "@/lib/actions/members";
import { idleState, type MemberType } from "@/lib/types";

export function RegistrationActions({
  memberId,
  declaredType,
}: {
  memberId: string;
  declaredType: MemberType | null;
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveMember,
    idleState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectMember,
    idleState,
  );

  const latest =
    (approveState.nonce ?? 0) > (rejectState.nonce ?? 0) ? approveState : rejectState;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={approveAction}>
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="memberType" value={declaredType ?? "student"} />
          <SubmitButton pending={approvePending} size="sm">
            Approve
          </SubmitButton>
        </form>

        <form action={rejectAction}>
          <input type="hidden" name="memberId" value={memberId} />
          <Button type="submit" variant="outline" size="sm" disabled={rejectPending}>
            Reject
          </Button>
        </form>
      </div>

      {/* Toast only: these sit inside table rows. */}
      <FormFeedback state={latest} toastOnly />
    </div>
  );
}
