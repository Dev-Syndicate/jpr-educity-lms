"use client";

import { DownloadIcon } from "lucide-react";
import { useActionState } from "react";

import { FormFeedback, SubmitButton, fieldErrors } from "@/components/form-feedback";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importMembers } from "@/lib/actions/members";
import { idleState } from "@/lib/types";

export function ImportForm() {
  const [state, action, pending] = useActionState(importMembers, idleState);
  const result = state.ok ? state.data : undefined;

  return (
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        {/* The outcome is the panel below, which lists the failed rows and has
            to stay on screen while they are corrected. */}
        <FormFeedback state={state} successToastOnly />

        <Field>
          <FieldLabel htmlFor="file">CSV file</FieldLabel>
          <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
          <FieldDescription>
            Columns: full_name, email, roll_number, member_type are required;
            department, phone and address are optional. Up to 500 rows.
          </FieldDescription>
        </Field>

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
            Given to every member in this file. They change it themselves under
            Password once signed in.
          </FieldDescription>
        </Field>

        <Field>
          <SubmitButton pending={pending} size="lg">
            Import members
          </SubmitButton>
        </Field>
      </FieldGroup>

      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="text-available font-medium">{result.created}</span>{" "}
            member{result.created === 1 ? "" : "s"} created
            {result.failures.length > 0 ? (
              <>
                {" · "}
                <span className="text-overdue font-medium">
                  {result.failures.length}
                </span>{" "}
                skipped
              </>
            ) : null}
          </p>

          {result.failures.length > 0 ? (
            <>
              {/* Line numbers, so the librarian can open the same file in a
                  spreadsheet and go straight to the row. */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Line</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.failures.map((failure) => (
                    <TableRow key={failure.line}>
                      <TableCell className="tabular-nums">{failure.line}</TableCell>
                      <TableCell>{failure.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {failure.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-muted-foreground text-sm">
                The members above were not created. Correct those lines and
                import the file again — the ones that succeeded are skipped as
                duplicates, so nothing is created twice.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

/** Download link for the template, so the columns are never guessed. */
export function TemplateLink() {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={
        <a href="/member-import-template.csv" download>
          <DownloadIcon />
          Download template
        </a>
      }
    />
  );
}
