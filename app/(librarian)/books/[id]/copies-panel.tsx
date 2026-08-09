"use client";

import { useActionState } from "react";

import { FormFeedback, SubmitButton } from "@/components/form-feedback";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addCopies, markCopyLost, setCopyStatus } from "@/lib/actions/books";
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

  const latest = [addState, statusState, lostState].reduce((a, b) =>
    (b.nonce ?? 0) > (a.nonce ?? 0) ? b : a,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Copies</CardTitle>
        <CardDescription>
          {copies.length} physical cop{copies.length === 1 ? "y" : "ies"}. Accession
          numbers are generated automatically.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <FormFeedback state={latest} />

        <form action={addAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="bookId" value={bookId} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="count" className="text-sm font-medium">
              Add copies
            </label>
            <Input
              id="count"
              name="count"
              inputMode="numeric"
              defaultValue="1"
              className="w-28"
            />
          </div>
          <SubmitButton pending={addPending} variant="outline">
            Add
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
                <TableHead>Accession</TableHead>
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
