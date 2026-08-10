"use client";

import { Trash2Icon } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { FormFeedback } from "@/components/form-feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteBook } from "@/lib/actions/books";
import { idleState } from "@/lib/types";

/**
 * Delete a title from the catalogue.
 *
 * Confirmed first, and destructive-styled, because it is irreversible — there
 * is no undo and no archive. The action itself refuses titles that have been
 * borrowed, so the worst a mistaken click can remove is a title nobody has
 * ever taken out.
 */
export function BookDelete({
  bookId,
  title,
  copyCount,
}: {
  bookId: string;
  title: string;
  copyCount: number;
}) {
  const [state, action, pending] = useActionState(deleteBook, idleState);
  const [confirming, setConfirming] = useState(false);

  function remove() {
    const fd = new FormData();
    fd.set("bookId", bookId);
    setConfirming(false);
    startTransition(() => action(fd));
  }

  return (
    <>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-label={`Delete ${title}`}
            >
              {pending ? <Spinner /> : <Trash2Icon />}
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {copyCount > 0
                ? `This removes the title and its ${copyCount} cop${copyCount === 1 ? "y" : "ies"} from the catalogue. It cannot be undone.`
                : "This removes the title from the catalogue. It cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={remove}
              disabled={pending}
            >
              {pending ? <Spinner /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toast only: this sits in a table row, and on success the row itself
          disappears — an inline alert would shift every row below it. */}
      <FormFeedback state={state} toastOnly />
    </>
  );
}
