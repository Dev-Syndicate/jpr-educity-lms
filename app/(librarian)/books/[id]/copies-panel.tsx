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
  shelf_location: string | null;
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
          serial number printed on each book.
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
            <FieldLabel htmlFor="accessionNumbers">Add copies by serial no.</FieldLabel>
            <Textarea
              id="accessionNumbers"
              name="accessionNumbers"
              rows={2}
              placeholder="JPR-00124&#10;JPR-00125"
              className="font-mono"
              aria-invalid={addState.fieldErrors?.accessionNumbers ? true : undefined}
            />
            <FieldError errors={fieldErrors(addState, "accessionNumbers")} />
            <FieldDescription>
              One per line, or separated by commas. Any format, as long as each is
              unique.
            </FieldDescription>
          </Field>
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
                <TableHead>Serial no.</TableHead>
                <TableHead>Shelf</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Held by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {copies.map((copy) => (
                <TableRow key={copy.id}>
                  <TableCell className="font-mono">{copy.accession_number}</TableCell>
                  <TableCell>
                    <ShelfCell
                      copyId={copy.id}
                      value={copy.shelf_location}
                      action={shelfAction}
                      pending={shelfPending}
                    />
                  </TableCell>
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

/**
 * Shelf location, edited in place.
 *
 * A shelf changes whenever books are reorganised, so this is a field rather
 * than a read-only value behind an Edit page. It submits on blur or Enter —
 * a Save button per row would be a lot of buttons for a one-word field.
 */
function ShelfCell({
  copyId,
  value,
  action,
  pending,
}: {
  copyId: string;
  value: string | null;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const initial = value ?? "";

  function submit(next: string) {
    // Nothing typed, or nothing changed — do not spend a round trip.
    if (next.trim() === initial) return;

    const fd = new FormData();
    fd.set("copyId", copyId);
    fd.set("shelfLocation", next.trim());
    startTransition(() => action(fd));
  }

  return (
    <Input
      defaultValue={initial}
      disabled={pending}
      placeholder="—"
      aria-label="Shelf location"
      className="h-8 w-28 font-mono text-sm"
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
