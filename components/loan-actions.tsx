"use client";

import { useActionState } from "react";

import { FormFeedback } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { renewLoan, returnBook } from "@/lib/actions/circulation";
import { idleState } from "@/lib/types";

/**
 * Renew / Return for one loan row.
 *
 * The renew action assesses any overdue fine first, so a refusal here always
 * names a real amount the librarian can collect.
 */
export function LoanActions({
  loanId,
  accessionNumber,
}: {
  loanId: string;
  accessionNumber: string;
}) {
  const [renewState, renewAction, renewPending] = useActionState(renewLoan, idleState);
  const [returnState, returnAction, returnPending] = useActionState(
    returnBook,
    idleState,
  );

  const latest =
    (renewState.nonce ?? 0) > (returnState.nonce ?? 0) ? renewState : returnState;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={renewAction}>
          <input type="hidden" name="loanId" value={loanId} />
          <Button type="submit" variant="outline" size="sm" disabled={renewPending}>
            {renewPending ? <Spinner /> : null}
            Renew
          </Button>
        </form>

        <form action={returnAction}>
          <input type="hidden" name="accessionNumber" value={accessionNumber} />
          <Button type="submit" size="sm" disabled={returnPending}>
            {returnPending ? <Spinner /> : null}
            Return
          </Button>
        </form>
      </div>

      {/* Toast only: an inline alert inside a table row shoves the whole
          table around on every renew. */}
      <FormFeedback state={latest} toastOnly />
    </div>
  );
}
