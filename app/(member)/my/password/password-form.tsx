"use client";

import { useActionState } from "react";

import { FormFeedback, SubmitButton, fieldErrors } from "@/components/form-feedback";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePassword } from "@/lib/actions/auth";
import { idleState } from "@/lib/types";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, idleState);

  return (
    <form
      action={action}
      className="flex flex-col gap-6"
      // Clear the fields after a successful change: the browser would
      // otherwise keep three filled password boxes on screen, which reads as
      // if the change had not gone through.
      key={state.ok ? state.nonce : undefined}
    >
      <FieldGroup>
        {/* Success goes to a toast — the form clears itself, and a banner
            above three now-empty boxes says less than the toast does.
            Failures stay inline, beside the field they name. */}
        <FormFeedback state={state} successToastOnly />

        <Field data-invalid={state.fieldErrors?.currentPassword ? true : undefined}>
          <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={state.fieldErrors?.currentPassword ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "currentPassword")} />
          <FieldDescription>
            If the library gave you a temporary password, that is this one.
          </FieldDescription>
        </Field>

        <Field data-invalid={state.fieldErrors?.newPassword ? true : undefined}>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={state.fieldErrors?.newPassword ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "newPassword")} />
          <FieldDescription>At least 8 characters.</FieldDescription>
        </Field>

        <Field data-invalid={state.fieldErrors?.confirmPassword ? true : undefined}>
          <FieldLabel htmlFor="confirmPassword">Repeat new password</FieldLabel>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={state.fieldErrors?.confirmPassword ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "confirmPassword")} />
        </Field>

        <Field>
          <SubmitButton pending={pending} size="lg">
            Change password
          </SubmitButton>
        </Field>
      </FieldGroup>
    </form>
  );
}
