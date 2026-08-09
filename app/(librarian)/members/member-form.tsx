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
import { createMember, updateMember } from "@/lib/actions/members";
import { idleState, type MemberType } from "@/lib/types";

export type MemberValues = {
  id?: string;
  fullName?: string | null;
  email?: string | null;
  rollNumber?: string | null;
  memberType?: MemberType | null;
  department?: string | null;
  phone?: string | null;
};

export function MemberForm({ member }: { member?: MemberValues }) {
  const editing = Boolean(member?.id);
  const [createState, createAction, createPending] = useActionState(
    createMember,
    idleState,
  );
  const [editState, editAction, editPending] = useActionState(updateMember, idleState);

  const state = editing ? editState : createState;
  const pending = editing ? editPending : createPending;

  return (
    <form
      action={editing ? editAction : createAction}
      className="flex max-w-xl flex-col gap-6"
    >
      <FieldGroup>
        <FormFeedback state={state} />

        {/* Show the credentials once, after creating an account. */}
        {!editing && createState.ok && createState.data ? (
          <div className="bg-available-subtle text-available flex flex-col gap-1 rounded-lg p-4 text-sm">
            <p className="font-semibold">Give these to the member now.</p>
            <p className="font-mono">{createState.data.email}</p>
            <p className="font-mono">{createState.data.password}</p>
            <p className="opacity-80">
              The password is not stored in readable form and cannot be shown again.
            </p>
          </div>
        ) : null}

        {editing ? <input type="hidden" name="memberId" value={member!.id} /> : null}

        <Field data-invalid={state.fieldErrors?.fullName ? true : undefined}>
          <FieldLabel htmlFor="fullName">Full name</FieldLabel>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={member?.fullName ?? ""}
            required
            autoFocus
            aria-invalid={state.fieldErrors?.fullName ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "fullName")} />
        </Field>

        {!editing ? (
          <Field data-invalid={state.fieldErrors?.email ? true : undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="student@gmail.com"
              aria-invalid={state.fieldErrors?.email ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "email")} />
            <FieldDescription>
              Their own personal address. Used to sign in and reset a password.
            </FieldDescription>
          </Field>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={state.fieldErrors?.rollNumber ? true : undefined}>
            <FieldLabel htmlFor="rollNumber">Roll / staff number</FieldLabel>
            <Input
              id="rollNumber"
              name="rollNumber"
              defaultValue={member?.rollNumber ?? ""}
              required
              placeholder="21CS042"
              aria-invalid={state.fieldErrors?.rollNumber ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "rollNumber")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="memberType">Member type</FieldLabel>
            <Select name="memberType" defaultValue={member?.memberType ?? "student"}>
              <SelectTrigger id="memberType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="student">Student — 3 books</SelectItem>
                  <SelectItem value="staff">Faculty — 5 books</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="department">Department</FieldLabel>
            <Input
              id="department"
              name="department"
              defaultValue={member?.department ?? ""}
              placeholder="CSE"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" name="phone" defaultValue={member?.phone ?? ""} />
          </Field>
        </div>

        {!editing ? (
          <Field data-invalid={state.fieldErrors?.password ? true : undefined}>
            <FieldLabel htmlFor="password">Temporary password</FieldLabel>
            <Input
              id="password"
              name="password"
              defaultValue="Library@123"
              required
              aria-invalid={state.fieldErrors?.password ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "password")} />
            <FieldDescription>
              Give this to the member. They can change it later.
            </FieldDescription>
          </Field>
        ) : null}

        <Field>
          <SubmitButton pending={pending} size="lg">
            {editing ? "Save changes" : "Create member"}
          </SubmitButton>
        </Field>
      </FieldGroup>
    </form>
  );
}
