"use client";

import { useActionState, useState } from "react";

import { FormFeedback, SubmitButton, fieldErrors } from "@/components/form-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createLibrarian } from "@/lib/actions/staff";
import { idleState } from "@/lib/types";

/**
 * Creating a librarian grants full access to everything, so the form is
 * deliberately awkward: it lives behind a dialog and needs GRANT typed out.
 */
export function LibrarianForm() {
  const [state, action, pending] = useActionState(createLibrarian, idleState);
  const [open, setOpen] = useState(false);
  const [shownNonce, setShownNonce] = useState<number | undefined>(undefined);

  // Close on success so the credentials below are not hidden behind the
  // dialog. Keyed on nonce rather than `ok` so reopening the dialog after a
  // success does not immediately slam it shut again.
  if (state.ok && state.nonce !== shownNonce) {
    setShownNonce(state.nonce);
    if (open) setOpen(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button>Add librarian</Button>} />
        <DialogContent className="sm:max-w-lg">
          <form action={action} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Add a librarian</DialogTitle>
              <DialogDescription>
                This account will be able to issue and return books, waive
                fines, edit the catalogue and change the library rules.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup>
              <FormFeedback state={state} />

              <Field data-invalid={state.fieldErrors?.fullName ? true : undefined}>
                <FieldLabel htmlFor="fullName">Full name</FieldLabel>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  aria-invalid={state.fieldErrors?.fullName ? true : undefined}
                />
                <FieldError errors={fieldErrors(state, "fullName")} />
              </Field>

              <Field data-invalid={state.fieldErrors?.email ? true : undefined}>
                <FieldLabel htmlFor="staffEmail">Email</FieldLabel>
                <Input
                  id="staffEmail"
                  name="email"
                  type="email"
                  required
                  placeholder="librarian@jpreducity.org"
                  aria-invalid={state.fieldErrors?.email ? true : undefined}
                />
                <FieldError errors={fieldErrors(state, "email")} />
              </Field>

              <div className="grid gap-6 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="staffPhone">Phone</FieldLabel>
                  <Input id="staffPhone" name="phone" type="tel" />
                </Field>

                <Field data-invalid={state.fieldErrors?.password ? true : undefined}>
                  <FieldLabel htmlFor="staffPassword">Temporary password</FieldLabel>
                  <Input
                    id="staffPassword"
                    name="password"
                    defaultValue="Library@123"
                    required
                    aria-invalid={state.fieldErrors?.password ? true : undefined}
                  />
                  <FieldError errors={fieldErrors(state, "password")} />
                </Field>
              </div>

              <Field data-invalid={state.fieldErrors?.confirm ? true : undefined}>
                <FieldLabel htmlFor="confirm">
                  Type GRANT to confirm full access
                </FieldLabel>
                <Input
                  id="confirm"
                  name="confirm"
                  required
                  autoComplete="off"
                  placeholder="GRANT"
                  aria-invalid={state.fieldErrors?.confirm ? true : undefined}
                />
                <FieldError errors={fieldErrors(state, "confirm")} />
                <FieldDescription>
                  A librarian account cannot be downgraded to a member later.
                </FieldDescription>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pending={pending}>Create librarian</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Shown outside the dialog: the dialog is closed by the time these
          credentials matter, and they can only ever be read once. */}
      {state.ok && state.data ? (
        <Alert className="border-available text-available mt-4">
          <AlertTitle>Give these to the new librarian now.</AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            <span className="font-mono">{state.data.email}</span>
            <span className="font-mono">{state.data.password}</span>
            <span className="opacity-80">
              The password is not stored in readable form and cannot be shown
              again.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
