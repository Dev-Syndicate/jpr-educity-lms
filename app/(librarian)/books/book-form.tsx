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
import { Textarea } from "@/components/ui/textarea";
import { createBook, updateBook } from "@/lib/actions/books";
import { idleState } from "@/lib/types";

export type BookValues = {
  id?: string;
  title?: string | null;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  year?: number | null;
  category?: string | null;
  language?: string | null;
  description?: string | null;
};

export function BookForm({ book }: { book?: BookValues }) {
  const editing = Boolean(book?.id);
  const [state, action, pending] = useActionState(
    editing ? updateBook : createBook,
    idleState,
  );

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <FieldGroup>
        <FormFeedback state={state} />

        {editing ? <input type="hidden" name="id" value={book!.id} /> : null}

        <Field data-invalid={state.fieldErrors?.title ? true : undefined}>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input
            id="title"
            name="title"
            defaultValue={book?.title ?? ""}
            required
            autoFocus
            aria-invalid={state.fieldErrors?.title ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "title")} />
        </Field>

        <Field data-invalid={state.fieldErrors?.author ? true : undefined}>
          <FieldLabel htmlFor="author">Author</FieldLabel>
          <Input
            id="author"
            name="author"
            defaultValue={book?.author ?? ""}
            required
            aria-invalid={state.fieldErrors?.author ? true : undefined}
          />
          <FieldError errors={fieldErrors(state, "author")} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={state.fieldErrors?.isbn ? true : undefined}>
            <FieldLabel htmlFor="isbn">ISBN</FieldLabel>
            <Input
              id="isbn"
              name="isbn"
              defaultValue={book?.isbn ?? ""}
              placeholder="978-0132350884"
              aria-invalid={state.fieldErrors?.isbn ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "isbn")} />
            <FieldDescription>Optional. Hyphens are ignored.</FieldDescription>
          </Field>

          <Field data-invalid={state.fieldErrors?.year ? true : undefined}>
            <FieldLabel htmlFor="year">Year</FieldLabel>
            <Input
              id="year"
              name="year"
              inputMode="numeric"
              defaultValue={book?.year ?? ""}
              placeholder="2019"
              aria-invalid={state.fieldErrors?.year ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "year")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="publisher">Publisher</FieldLabel>
            <Input id="publisher" name="publisher" defaultValue={book?.publisher ?? ""} />
          </Field>

          <Field>
            <FieldLabel htmlFor="edition">Edition</FieldLabel>
            <Input id="edition" name="edition" defaultValue={book?.edition ?? ""} />
          </Field>

          <Field>
            <FieldLabel htmlFor="category">Category</FieldLabel>
            <Input
              id="category"
              name="category"
              defaultValue={book?.category ?? ""}
              placeholder="Computer Science"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="language">Language</FieldLabel>
            <Input
              id="language"
              name="language"
              defaultValue={book?.language ?? "English"}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" name="description" defaultValue={book?.description ?? ""} />
        </Field>

        {!editing ? (
          <Field data-invalid={state.fieldErrors?.accessionNumbers ? true : undefined}>
            <FieldLabel htmlFor="accessionNumbers">Serial numbers</FieldLabel>
            <Textarea
              id="accessionNumbers"
              name="accessionNumbers"
              rows={3}
              placeholder="JPR-00124&#10;JPR-00125"
              className="font-mono"
              aria-invalid={state.fieldErrors?.accessionNumbers ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "accessionNumbers")} />
            <FieldDescription>
              The serial number printed on each physical copy — one per line, or
              separated by commas. Leave blank to add copies later.
            </FieldDescription>
          </Field>
        ) : null}

        <Field>
          <SubmitButton pending={pending} size="lg">
            {editing ? "Save changes" : "Add book"}
          </SubmitButton>
        </Field>
      </FieldGroup>
    </form>
  );
}
