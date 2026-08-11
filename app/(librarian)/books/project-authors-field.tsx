"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ProjectAuthor } from "@/lib/types";

/**
 * The students on a project or thesis (PRD B-11).
 *
 * Every row posts `authorRoll` and `authorName`, so the action receives two
 * parallel lists via formData.getAll() and zips them back together. Rows are
 * therefore identified by their POSITION in the form, which is why removing
 * one has to remove both of its inputs together.
 *
 * Rows carry a stable `key` that is not the array index: keying on the index
 * makes React reuse the input that was there before, so deleting the second
 * of three students visibly leaves the third student's text sitting in the
 * second row's box.
 */
export function ProjectAuthorsField({
  authors,
  errors,
}: {
  authors?: ProjectAuthor[];
  /** Already in FieldError's shape — pass fieldErrors(state, "authors"). */
  errors?: Array<{ message?: string } | undefined>;
}) {
  // Start with one blank row so the librarian can type straight away — a
  // project always has at least one student, so an empty list is never the
  // intended end state.
  const [rows, setRows] = useState<{ key: string; value: ProjectAuthor }[]>(() =>
    (authors?.length ? authors : [{ rollNumber: "", fullName: "" }]).map(
      (value, index) => ({ key: `saved-${index}`, value }),
    ),
  );

  // Monotonic, so a key is never reused by a later row.
  const [nextKey, setNextKey] = useState(0);

  function addRow() {
    setRows((current) => [
      ...current,
      { key: `new-${nextKey}`, value: { rollNumber: "", fullName: "" } },
    ]);
    setNextKey((n) => n + 1);
  }

  function removeRow(key: string) {
    // Never drop to zero rows: with no inputs at all there is nothing to type
    // into, and the librarian would have to find the Add button to recover.
    setRows((current) =>
      current.length === 1
        ? [{ key: current[0].key, value: { rollNumber: "", fullName: "" } }]
        : current.filter((row) => row.key !== key),
    );
  }

  return (
    <Field data-invalid={errors?.length ? true : undefined}>
      <FieldLabel>Students</FieldLabel>

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-end gap-3">
            <Field className="flex-1">
              <FieldLabel
                htmlFor={`authorRoll-${row.key}`}
                className="text-muted-foreground text-xs"
              >
                Roll number
              </FieldLabel>
              <Input
                id={`authorRoll-${row.key}`}
                name="authorRoll"
                defaultValue={row.value.rollNumber}
                placeholder="21CS045"
                className="font-mono"
                autoFocus={index > 0 && row.key.startsWith("new-")}
              />
            </Field>

            <Field className="flex-2">
              <FieldLabel
                htmlFor={`authorName-${row.key}`}
                className="text-muted-foreground text-xs"
              >
                Name
              </FieldLabel>
              <Input
                id={`authorName-${row.key}`}
                name="authorName"
                defaultValue={row.value.fullName}
                placeholder="A. Kumar"
              />
            </Field>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove student ${index + 1}`}
            >
              <XIcon />
            </Button>
          </div>
        ))}
      </div>

      <div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <PlusIcon />
          Add student
        </Button>
      </div>

      <FieldError errors={errors} />
      <FieldDescription>
        One row per student. A project may have a single student or a whole
        team.
      </FieldDescription>
    </Field>
  );
}
