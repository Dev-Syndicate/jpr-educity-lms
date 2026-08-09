"use client";

import { useActionState, useState } from "react";

import { FormFeedback, SubmitButton } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { collectFine, waiveFine } from "@/lib/actions/fines";
import { idleState } from "@/lib/types";

export function FineActions({
  fineId,
  amount,
  memberName,
}: {
  fineId: string;
  amount: number;
  memberName: string;
}) {
  const [payState, payAction, payPending] = useActionState(collectFine, idleState);
  const [waiveState, waiveAction, waivePending] = useActionState(waiveFine, idleState);
  const [open, setOpen] = useState(false);

  const latest =
    (payState.nonce ?? 0) > (waiveState.nonce ?? 0) ? payState : waiveState;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={payAction}>
          <input type="hidden" name="fineId" value={fineId} />
          <SubmitButton pending={payPending} size="sm">
            Collect ₹{amount.toFixed(2)}
          </SubmitButton>
        </form>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button variant="outline" size="sm">
                Waive
              </Button>
            }
          />
          <DialogContent>
            <form action={waiveAction}>
              <DialogHeader>
                <DialogTitle>Waive ₹{amount.toFixed(2)}?</DialogTitle>
                <DialogDescription>
                  For {memberName}. A reason is required and is kept on record.
                </DialogDescription>
              </DialogHeader>

              <input type="hidden" name="fineId" value={fineId} />

              <Field className="py-4">
                <FieldLabel htmlFor={`reason-${fineId}`}>Reason</FieldLabel>
                <Textarea
                  id={`reason-${fineId}`}
                  name="reason"
                  required
                  placeholder="Medical leave, certificate shown"
                />
                <FieldDescription>
                  Stored with your name and the date.
                </FieldDescription>
              </Field>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <SubmitButton pending={waivePending}>Waive fine</SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Toast only: these sit inside table rows. */}
      <FormFeedback state={latest} toastOnly />
    </div>
  );
}
