"use client";

import { useActionState, useState } from "react";

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
  loan_period_days_staff: number;
  fine_per_day: number;
  max_renewals: number;
  max_books_student: number;
  max_books_staff: number;
  public_registration: boolean;
  library_name: string;
};

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, action, pending] = useActionState(updateSettings, idleState);

  /**
   * Controlled, unlike the text inputs.
   *
   * With defaultChecked the switch ignored the value that arrives when the
   * page revalidates after a save, so it could sit at odds with what is
   * actually stored — and Base UI warned about exactly that. Seeded from the
   * server value and re-seeded whenever it changes.
   */
  const [publicRegistration, setPublicRegistration] = useState(
    settings.public_registration,
  );
  const [seeded, setSeeded] = useState(settings.public_registration);

  if (seeded !== settings.public_registration) {
    setSeeded(settings.public_registration);
    setPublicRegistration(settings.public_registration);
  }

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      {/* "Saved." goes to a toast — the librarian stays on this page and a
          banner above the fields just pushed the form down. A validation
          failure stays inline, where it points at the fields it names. */}
      <FormFeedback state={state} successToastOnly />

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
            {/* Each input is keyed on its saved value so a successful save
                remounts it. These are uncontrolled, but updateSettings calls
                refresh(), which feeds new values back into defaultValue —
                which does nothing to a live input and makes Base UI warn
                about changing an uncontrolled field after initialization. */}
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.loanPeriodDays ? true : undefined}>
                <FieldLabel htmlFor="loanPeriodDays">
                  Loan period — student (days)
                </FieldLabel>
                <Input
                  id="loanPeriodDays"
                  name="loanPeriodDays"
                  inputMode="numeric"
                  key={settings.loan_period_days}
                  defaultValue={settings.loan_period_days}
                />
                <FieldError errors={fieldErrors(state, "loanPeriodDays")} />
              </Field>

              <Field
                data-invalid={state.fieldErrors?.loanPeriodDaysStaff ? true : undefined}
              >
                <FieldLabel htmlFor="loanPeriodDaysStaff">
                  Loan period — faculty (days)
                </FieldLabel>
                <Input
                  id="loanPeriodDaysStaff"
                  name="loanPeriodDaysStaff"
                  inputMode="numeric"
                  key={settings.loan_period_days_staff}
                  defaultValue={settings.loan_period_days_staff}
                />
                <FieldError errors={fieldErrors(state, "loanPeriodDaysStaff")} />
                <FieldDescription>90 days is about three months.</FieldDescription>
              </Field>

              <Field data-invalid={state.fieldErrors?.finePerDay ? true : undefined}>
                <FieldLabel htmlFor="finePerDay">Fine per day (₹)</FieldLabel>
                <Input
                  id="finePerDay"
                  name="finePerDay"
                  inputMode="decimal"
                  key={settings.fine_per_day}
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
                  key={settings.max_renewals}
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
                  key={settings.max_books_student}
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
                  key={settings.max_books_staff}
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
                checked={publicRegistration}
                onCheckedChange={setPublicRegistration}
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
                key={settings.library_name}
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
