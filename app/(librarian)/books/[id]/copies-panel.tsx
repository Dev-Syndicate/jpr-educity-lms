"use client";

import { startTransition, useActionState } from "react";

import { FormFeedback, SubmitButton, fieldErrors } from "@/components/form-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addCopies,
  markCopyLost,
  setCopyShelfLocation,
  setCopyStatus,
} from "@/lib/actions/books";
import { idleState, type CopyStatus } from "@/lib/types";

export type CopyRow = {
  id: string;
  accession_number: string;
  status: CopyStatus;
  row_no: string | null;
  rack_no: string | null;
  section: string | null;
  borrower: string | null;
  due_date: string | null;
};

const STATUS_STYLE: Record<CopyStatus, string> = {
  available: "bg-available-subtle text-available",
  issued: "bg-issued-subtle text-issued",
  lost: "bg-overdue-subtle text-overdue",
  damaged: "bg-pending-subtle text-pending",
};

export function CopiesPanel({
  bookId,
  copies,
}: {
  bookId: string;
  copies: CopyRow[];
}) {
  const [addState, addAction, addPending] = useActionState(addCopies, idleState);
  const [statusState, statusAction, statusPending] = useActionState(
    setCopyStatus,
    idleState,
  );
  const [lostState, lostAction, lostPending] = useActionState(markCopyLost, idleState);
  const [shelfState, shelfAction, shelfPending] = useActionState(
    setCopyShelfLocation,
    idleState,
  );

  // Row actions announce themselves through the toast only. An inline banner
  // above the table pushed every row down on each click, and said the same
  // thing the toast was already saying.
  const rowResult = [statusState, lostState, shelfState].reduce((a, b) =>
    (b.nonce ?? 0) > (a.nonce ?? 0) ? b : a,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Copies</CardTitle>
        <CardDescription>
          {copies.length} physical cop{copies.length === 1 ? "y" : "ies"}. Enter the
          accession number printed on each book.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Both toast-only: the add form shows its own error against the
            field, and a row action needs no banner above the table. */}
        <FormFeedback state={rowResult} toastOnly />
        <FormFeedback state={addState} toastOnly />

        <form action={addAction} className="flex flex-col gap-2">
          <input type="hidden" name="bookId" value={bookId} />
          {/* Bound to addState, not the newest action of any kind: a failed
              Mark lost must not mark this textarea invalid. */}
          <Field data-invalid={addState.fieldErrors?.accessionNumbers ? true : undefined}>
            <FieldLabel htmlFor="accessionNumbers">Add copies by accession no.</FieldLabel>
            <Textarea
              id="accessionNumbers"
              name="accessionNumbers"
              rows={2}
              placeholder="4521&#10;4522"
              className="font-mono"
              aria-invalid={addState.fieldErrors?.accessionNumbers ? true : undefined}
            />
            <FieldError errors={fieldErrors(addState, "accessionNumbers")} />
            <FieldDescription>
              One per line, or separated by commas. Any format, as long as each is
              unique.
            </FieldDescription>
          </Field>

          {/* Applies to the whole batch. Left blank the copies are unshelved,
              which the table above makes obvious and editable per row. */}
          <div className="grid max-w-md grid-cols-3 gap-3">
            <Field>
              <FieldLabel htmlFor="addRowNo" className="text-muted-foreground text-xs">
                Row
              </FieldLabel>
              <Input id="addRowNo" name="rowNo" placeholder="09" className="font-mono" />
            </Field>
            <Field>
              <FieldLabel htmlFor="addRackNo" className="text-muted-foreground text-xs">
                Rack
              </FieldLabel>
              <Input id="addRackNo" name="rackNo" placeholder="01" className="font-mono" />
            </Field>
            <Field>
              <FieldLabel htmlFor="addSection" className="text-muted-foreground text-xs">
                Section
              </FieldLabel>
              <Input id="addSection" name="section" placeholder="A" className="font-mono" />
            </Field>
          </div>

          <SubmitButton pending={addPending} variant="outline" className="self-start">
            Add copies
          </SubmitButton>
        </form>

        {!copies.length ? (
          <Empty className="py-8">
            <EmptyTitle>No copies yet</EmptyTitle>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Accession no.</TableHead>
                <TableHead>Row</TableHead>
                <TableHead>Rack</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Held by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {copies.map((copy) => (
                <TableRow key={copy.id}>
                  <TableCell className="font-mono">{copy.accession_number}</TableCell>
                  {/* One cell per part of the rack label. Each submits the
                      whole location, so editing the rack cannot blank the row
                      it was already sitting in. */}
                  {(["rowNo", "rackNo", "section"] as const).map((part) => (
                    <TableCell key={part}>
                      <ShelfCell
                        copyId={copy.id}
                        part={part}
                        location={{
                          rowNo: copy.row_no,
                          rackNo: copy.rack_no,
                          section: copy.section,
                        }}
                        action={shelfAction}
                        pending={shelfPending}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Badge className={STATUS_STYLE[copy.status]}>{copy.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {copy.borrower ? `${copy.borrower} · due ${copy.due_date}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {copy.status !== "available" && copy.status !== "issued" ? (
                        <form action={statusAction}>
                          <input type="hidden" name="copyId" value={copy.id} />
                          <input type="hidden" name="status" value="available" />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            disabled={statusPending}
                          >
                            Back to shelf
                          </Button>
                        </form>
                      ) : null}

                      {copy.status !== "lost" ? (
                        <form action={lostAction}>
                          <input
                            type="hidden"
                            name="accessionNumber"
                            value={copy.accession_number}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            disabled={lostPending}
                          >
                            Mark lost
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const PART_LABEL = {
  rowNo: "Row",
  rackNo: "Rack",
  section: "Section",
} as const;

type ShelfPart = keyof typeof PART_LABEL;

/**
 * One editable part of a copy's shelf address, edited in place.
 *
 * A location changes whenever books are reorganised, so these are fields
 * rather than read-only values behind an Edit page. They submit on blur or
 * Enter — a Save button per row would be a lot of buttons for a one-word
 * field.
 *
 * The action takes the whole location, not a single field, so this sends the
 * other two parts back unchanged alongside the edited one. Sending only the
 * edited field would clear the rest, since the action treats a missing value
 * as "cleared".
 */
function ShelfCell({
  copyId,
  part,
  location,
  action,
  pending,
}: {
  copyId: string;
  part: ShelfPart;
  location: { rowNo: string | null; rackNo: string | null; section: string | null };
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const initial = location[part] ?? "";

  function submit(next: string) {
    // Nothing changed — do not spend a round trip. Compared case-insensitively
    // because the action uppercases, so "a" -> "A" is not a real edit.
    if (next.trim().toUpperCase() === initial.toUpperCase()) return;

    const fd = new FormData();
    fd.set("copyId", copyId);
    fd.set("rowNo", location.rowNo ?? "");
    fd.set("rackNo", location.rackNo ?? "");
    fd.set("section", location.section ?? "");
    // Overwrite just the part being edited.
    fd.set(part, next.trim());
    startTransition(() => action(fd));
  }

  return (
    <Input
      /*
       * key on the saved value, so a successful save REMOUNTS this input.
       *
       * The field is uncontrolled — the librarian types freely and it submits
       * on blur — but `initial` is server state, and refresh() after a save
       * feeds a new value back. Changing defaultValue on a live input does
       * nothing to the DOM and makes Base UI warn:
       *
       *   "A component is changing the default value state of an uncontrolled
       *    FieldControl after being initialized."
       *
       * Remounting adopts the value the server actually stored — which is
       * uppercased, so typing "a" correctly settles as "A" instead of the
       * cell disagreeing with the database until the next full load.
       */
      key={initial}
      defaultValue={initial}
      disabled={pending}
      placeholder="—"
      aria-label={PART_LABEL[part]}
      className="h-8 w-16 font-mono text-sm"
      onBlur={(event) => submit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
