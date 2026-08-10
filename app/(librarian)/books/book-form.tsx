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
import { Textarea } from "@/components/ui/textarea";
import { createBook, updateBook } from "@/lib/actions/books";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  idleState,
  type MaterialCategory,
} from "@/lib/types";

export type BookValues = {
  id?: string;
  title?: string | null;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  year?: number | null;
  category?: MaterialCategory | null;
  department?: string | null;
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
            key={book?.title ?? ""}
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
            key={book?.author ?? ""}
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
              key={book?.isbn ?? ""}
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
              key={book?.year ?? ""}
              defaultValue={book?.year ?? ""}
              placeholder="2019"
              aria-invalid={state.fieldErrors?.year ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "year")} />
          </Field>

          <Field>
            <FieldLabel htmlFor="publisher">Publisher</FieldLabel>
            <Input
              id="publisher"
              name="publisher"
              key={book?.publisher ?? ""}
              defaultValue={book?.publisher ?? ""}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edition">Edition</FieldLabel>
            <Input
              id="edition"
              name="edition"
              key={book?.edition ?? ""}
              defaultValue={book?.edition ?? ""}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="category">Category</FieldLabel>
            <Select
              key={book?.category ?? "book"}
              name="category"
              defaultValue={book?.category ?? "book"}
            >
              <SelectTrigger id="category">
                {/* Base UI renders the raw value unless given a formatter —
                    unlike Radix, it does not mirror the item's children. So
                    the trigger would read "non_book_material" without this. */}
                <SelectValue>
                  {(value: MaterialCategory | null) =>
                    value ? MATERIAL_CATEGORY_LABELS[value] : ""
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MATERIAL_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MATERIAL_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="department">Department</FieldLabel>
            <Input
              id="department"
              name="department"
              key={book?.department ?? ""}
              defaultValue={book?.department ?? ""}
              placeholder="Computer Science"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="language">Language</FieldLabel>
            <Input
              id="language"
              name="language"
              key={book?.language ?? "English"}
              defaultValue={book?.language ?? "English"}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            name="description"
            key={book?.description ?? ""}
            defaultValue={book?.description ?? ""}
          />
        </Field>

        {!editing ? (
          <Field data-invalid={state.fieldErrors?.accessionNumbers ? true : undefined}>
            <FieldLabel htmlFor="accessionNumbers">Accession numbers</FieldLabel>
            <Textarea
              id="accessionNumbers"
              name="accessionNumbers"
              rows={3}
              placeholder="4521&#10;4522"
              className="font-mono"
              aria-invalid={state.fieldErrors?.accessionNumbers ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "accessionNumbers")} />
            <FieldDescription>
              The accession number printed on each physical copy — one per line,
              or separated by commas. Leave blank to add copies later.
            </FieldDescription>
          </Field>
        ) : null}

        {/* Only when creating: these describe the copies being added above,
            not the title. Editing a title must not silently move copies that
            are already shelved — that is done per copy in the copies table. */}
        {!editing ? (
          <Field>
            <FieldLabel htmlFor="rowNo">Location</FieldLabel>
            <div className="grid grid-cols-3 gap-3">
              <Field>
                <FieldLabel htmlFor="rowNo" className="text-muted-foreground text-xs">
                  Row
                </FieldLabel>
                <Input id="rowNo" name="rowNo" placeholder="09" className="font-mono" />
              </Field>
              <Field>
                <FieldLabel htmlFor="rackNo" className="text-muted-foreground text-xs">
                  Rack
                </FieldLabel>
                <Input id="rackNo" name="rackNo" placeholder="01" className="font-mono" />
              </Field>
              <Field>
                <FieldLabel htmlFor="section" className="text-muted-foreground text-xs">
                  Section
                </FieldLabel>
                <Input id="section" name="section" placeholder="A" className="font-mono" />
              </Field>
            </div>
            <FieldDescription>
              Where these copies sit, from the rack label. Applies to every
              accession number above; individual copies can be moved later.
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
