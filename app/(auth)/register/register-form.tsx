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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerMember } from "@/lib/actions/register";
import { idleState } from "@/lib/types";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerMember, idleState);

  // Once the application is in, the form is replaced entirely — resubmitting
  // would only fail on the duplicate email.
  if (state.ok && state.data) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-available-subtle text-available flex flex-col gap-2 rounded-lg p-4 text-sm">
          <p className="font-semibold">Application received.</p>
          <p className="opacity-90">
            Bring your college ID to the library counter. The librarian will
            approve your account and can issue your first book straight away.
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          You can sign in with{" "}
          <span className="font-mono">{state.data.email}</span> now, but you will
          not be able to borrow until you are approved.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        <FormFeedback state={state} />

        <Field data-invalid={state.fieldErrors?.fullName ? true : undefined}>
          <FieldLabel htmlFor="fullName">Full name</FieldLabel>
          <Input
            id="fullName"
            name="fullName"
            required
            autoFocus
            autoComplete="name"
            aria-invalid={state.fieldErrors?.fullName ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "fullName")} />
        </Field>

        <Field data-invalid={state.fieldErrors?.email ? true : undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@gmail.com"
            aria-invalid={state.fieldErrors?.email ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "email")} />
          <FieldDescription>
            Your own address. You will sign in with it.
          </FieldDescription>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={state.fieldErrors?.rollNumber ? true : undefined}>
            <FieldLabel htmlFor="rollNumber">Roll / staff number</FieldLabel>
            <Input
              id="rollNumber"
              name="rollNumber"
              required
              placeholder="21CS042"
              aria-invalid={state.fieldErrors?.rollNumber ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "rollNumber")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="memberType">I am a</FieldLabel>
            <Select name="memberType" defaultValue="student">
              <SelectTrigger id="memberType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="staff">Faculty</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>Checked at the counter.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="department">Department</FieldLabel>
            <Input id="department" name="department" placeholder="CSE" />
          </Field>

          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={state.fieldErrors?.password ? true : undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              aria-invalid={state.fieldErrors?.password ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "password")} />
          </Field>

          <Field data-invalid={state.fieldErrors?.confirmPassword ? true : undefined}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              aria-invalid={state.fieldErrors?.confirmPassword ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "confirmPassword")} />
          </Field>
        </div>

        <Field>
          <SubmitButton pending={pending} size="lg">
            Apply for a library account
          </SubmitButton>
          <FieldDescription>
            At least 8 characters. Your account is activated at the counter.
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
