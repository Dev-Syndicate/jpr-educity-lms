"use client";

import { useActionState } from "react";

import { FormFeedback, SubmitButton, fieldErrors } from "@/components/form-feedback";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateSettings } from "@/lib/actions/settings";
import { idleState } from "@/lib/types";

export type SettingsValues = {
  loan_period_days: number;
  fine_per_day: number;
  max_renewals: number;
  max_books_student: number;
  max_books_staff: number;
  public_registration: boolean;
  library_name: string;
};

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, action, pending] = useActionState(updateSettings, idleState);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <FormFeedback state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Borrowing rules</CardTitle>
          <CardDescription>
            Changes apply to new loans only. A loan keeps the period and fine rate
            it was issued under, so past fines are never re-priced.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.loanPeriodDays ? true : undefined}>
                <FieldLabel htmlFor="loanPeriodDays">Loan period (days)</FieldLabel>
                <Input
                  id="loanPeriodDays"
                  name="loanPeriodDays"
                  inputMode="numeric"
                  defaultValue={settings.loan_period_days}
                />
                <FieldError errors={fieldErrors(state, "loanPeriodDays")} />
              </Field>

              <Field data-invalid={state.fieldErrors?.finePerDay ? true : undefined}>
                <FieldLabel htmlFor="finePerDay">Fine per day (₹)</FieldLabel>
                <Input
                  id="finePerDay"
                  name="finePerDay"
                  inputMode="decimal"
                  defaultValue={settings.fine_per_day}
                />
                <FieldError errors={fieldErrors(state, "finePerDay")} />
              </Field>

              <Field data-invalid={state.fieldErrors?.maxRenewals ? true : undefined}>
                <FieldLabel htmlFor="maxRenewals">Maximum renewals</FieldLabel>
                <Input
                  id="maxRenewals"
                  name="maxRenewals"
                  inputMode="numeric"
                  defaultValue={settings.max_renewals}
                />
                <FieldError errors={fieldErrors(state, "maxRenewals")} />
              </Field>

              <Field data-invalid={state.fieldErrors?.maxBooksStudent ? true : undefined}>
                <FieldLabel htmlFor="maxBooksStudent">Max books — student</FieldLabel>
                <Input
                  id="maxBooksStudent"
                  name="maxBooksStudent"
                  inputMode="numeric"
                  defaultValue={settings.max_books_student}
                />
                <FieldError errors={fieldErrors(state, "maxBooksStudent")} />
              </Field>

              <Field data-invalid={state.fieldErrors?.maxBooksStaff ? true : undefined}>
                <FieldLabel htmlFor="maxBooksStaff">Max books — faculty</FieldLabel>
                <Input
                  id="maxBooksStaff"
                  name="maxBooksStaff"
                  inputMode="numeric"
                  defaultValue={settings.max_books_staff}
                />
                <FieldError errors={fieldErrors(state, "maxBooksStaff")} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>
            When open, anyone with the link can apply. Applications are approved at
            the counter when the person first comes to borrow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch
                id="publicRegistration"
                name="publicRegistration"
                defaultChecked={settings.public_registration}
              />
              <FieldLabel htmlFor="publicRegistration">
                Allow public registration
              </FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="libraryName">Library name</FieldLabel>
              <Input
                id="libraryName"
                name="libraryName"
                defaultValue={settings.library_name}
              />
              <FieldDescription>Shown to members.</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div>
        <SubmitButton pending={pending} size="lg">
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}
