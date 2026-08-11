"use client";

import { useActionState, useState } from "react";

import { FormFeedback, SubmitButton, fieldErrors } from "@/components/form-feedback";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
import { cn } from "@/lib/utils";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  idleState,
  isProjectCategory,
  type MaterialCategory,
  type ProjectAuthor,
} from "@/lib/types";

import { ProjectAuthorsField } from "./project-authors-field";

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
  callNo?: string | null;
  language?: string | null;
  description?: string | null;
  totalPages?: number | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  distributor?: string | null;
  price?: number | null;
  projectNo?: string | null;
  degree?: string | null;
  batchMonth?: string | null;
  authors?: ProjectAuthor[];
};

export function BookForm({ book }: { book?: BookValues }) {
  const editing = Boolean(book?.id);
  const [state, action, pending] = useActionState(
    editing ? updateBook : createBook,
    idleState,
  );

  // Controlled, unlike every other field here, because the form's shape
  // depends on it — an uncontrolled Select would keep its value to itself.
  const [category, setCategory] = useState<MaterialCategory>(
    book?.category ?? "book",
  );

  // A project or thesis is a student submission, not something the library
  // bought from a distributor. It has no ISBN, publisher, edition or invoice,
  // so those fields are not rendered at all rather than shown for the
  // librarian to leave blank — an empty ISBN box on a thesis is a question
  // that should never have been asked.
  //
  // Its author is its students, so the Author box is replaced by the student
  // list below and `author` is derived from the first row server-side.
  const isProject = isProjectCategory(category);

  return (
    // Width is set by the page, which constrains the heading with it.
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        <FormFeedback state={state} />

        {editing ? <input type="hidden" name="id" value={book!.id} /> : null}

        {/* First, because it decides which fields the rest of the form shows.
            Asked last it would reshape the form under someone who had already
            filled it in — and a librarian who picks "Thesis" after typing an
            ISBN has typed it for nothing. */}
        <Field>
          <FieldLabel htmlFor="category">Category</FieldLabel>
          <Select
            name="category"
            value={category}
            onValueChange={(value) => setCategory(value as MaterialCategory)}
          >
            <SelectTrigger id="category" className="w-full">
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
          <FieldDescription>
            What kind of item this is. It decides which details are asked for
            below.
          </FieldDescription>
        </Field>

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

        {/* A project's author is its student list, so the box would be asking
            for the same names twice. See isProject above. */}
        {!isProject ? (
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
        ) : null}

        {/* One column on a project, where Department is the only field left —
            a lone box in a two-column grid reads as a missing field. */}
        <div className={cn("grid gap-6", !isProject && "sm:grid-cols-2")}>
          {!isProject ? (
            <>
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
                <FieldDescription>
                  Optional. Hyphens are ignored.
                </FieldDescription>
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
            </>
          ) : null}

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

          <Field data-invalid={state.fieldErrors?.callNo ? true : undefined}>
            <FieldLabel htmlFor="callNo">Call no.</FieldLabel>
            <Input
              id="callNo"
              name="callNo"
              key={book?.callNo ?? ""}
              defaultValue={book?.callNo ?? ""}
              placeholder="530"
              className="font-mono"
              aria-invalid={state.fieldErrors?.callNo ? true : undefined}
            />
            <FieldError errors={fieldErrors(state, "callNo")} />
            <FieldDescription>
              From the rack label — the classification, e.g. 530 or 512.943 4.
            </FieldDescription>
          </Field>

          {!isProject ? (
            <Field>
              <FieldLabel htmlFor="language">Language</FieldLabel>
              <Input
                id="language"
                name="language"
                key={book?.language ?? "English"}
                defaultValue={book?.language ?? "English"}
              />
            </Field>
          ) : null}
        </div>

        {!isProject ? (
          <Field>
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <Textarea
              id="description"
              name="description"
              key={book?.description ?? ""}
              defaultValue={book?.description ?? ""}
            />
          </Field>
        ) : null}

        {/* Project / thesis only (PRD B-11). Rendered conditionally rather
            than hidden with CSS: a hidden input still posts, and the database
            rejects a project number on a magazine outright. Unmounting is
            also what makes the cleared value real rather than merely
            invisible. */}
        {isProject ? (
          <FieldSet className="border-border gap-6 rounded-lg border p-4">
            <FieldLegend>
              {MATERIAL_CATEGORY_LABELS[category]} details
            </FieldLegend>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="projectNo">Project number</FieldLabel>
                <Input
                  id="projectNo"
                  name="projectNo"
                  key={book?.projectNo ?? ""}
                  defaultValue={book?.projectNo ?? ""}
                  placeholder="PRJ-2025-014"
                  className="font-mono"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="degree">Degree</FieldLabel>
                <Input
                  id="degree"
                  name="degree"
                  key={book?.degree ?? ""}
                  defaultValue={book?.degree ?? ""}
                  placeholder="B.E."
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="batchMonth">Batch</FieldLabel>
                <Input
                  id="batchMonth"
                  name="batchMonth"
                  key={book?.batchMonth ?? ""}
                  defaultValue={book?.batchMonth ?? ""}
                  placeholder="May 2025"
                />
                <FieldDescription>
                  As printed on the report — month and year.
                </FieldDescription>
              </Field>
            </div>

            {/* Keyed on the saved list so a successful save remounts the rows
                with their new server values, the same reason every other
                field here carries a key. */}
            <ProjectAuthorsField
              key={(book?.authors ?? []).map((a) => a.rollNumber).join(",")}
              authors={book?.authors}
              errors={fieldErrors(state, "authors")}
            />

            <FieldDescription>
              The department these students belong to is the Department field
              above.
            </FieldDescription>
          </FieldSet>
        ) : null}

        {/* Acquisition (PRD B-10) — how this title was bought. All optional:
            a donated item has no invoice. Absent entirely on a project, which
            is submitted by students rather than purchased. */}
        {!isProject ? (
          <FieldSet className="border-border gap-6 rounded-lg border p-4">
            <FieldLegend>Acquisition</FieldLegend>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.invoiceNo ? true : undefined}>
                <FieldLabel htmlFor="invoiceNo">Invoice number</FieldLabel>
                <Input
                  id="invoiceNo"
                  name="invoiceNo"
                  key={book?.invoiceNo ?? ""}
                  defaultValue={book?.invoiceNo ?? ""}
                  placeholder="INV-2291"
                  className="font-mono"
                  aria-invalid={state.fieldErrors?.invoiceNo ? true : undefined}
                />
                <FieldError errors={fieldErrors(state, "invoiceNo")} />
              </Field>

              <Field data-invalid={state.fieldErrors?.invoiceDate ? true : undefined}>
                <FieldLabel htmlFor="invoiceDate">Invoice date</FieldLabel>
                <Input
                  id="invoiceDate"
                  name="invoiceDate"
                  type="date"
                  key={book?.invoiceDate ?? ""}
                  defaultValue={book?.invoiceDate ?? ""}
                  aria-invalid={state.fieldErrors?.invoiceDate ? true : undefined}
                />
                <FieldError errors={fieldErrors(state, "invoiceDate")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="distributor">Distributor</FieldLabel>
                <Input
                  id="distributor"
                  name="distributor"
                  key={book?.distributor ?? ""}
                  defaultValue={book?.distributor ?? ""}
                  placeholder="Higginbothams"
                />
              </Field>

              <Field data-invalid={state.fieldErrors?.price ? true : undefined}>
                <FieldLabel htmlFor="price">Price</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>₹</InputGroupAddon>
                  <InputGroupInput
                    id="price"
                    name="price"
                    inputMode="decimal"
                    key={book?.price ?? ""}
                    defaultValue={book?.price ?? ""}
                    placeholder="450"
                    aria-invalid={state.fieldErrors?.price ? true : undefined}
                  />
                </InputGroup>
                <FieldError errors={fieldErrors(state, "price")} />
                <FieldDescription>
                  What was paid for it, not the replacement charge.
                </FieldDescription>
              </Field>

              <Field data-invalid={state.fieldErrors?.totalPages ? true : undefined}>
                <FieldLabel htmlFor="totalPages">Total pages</FieldLabel>
                <Input
                  id="totalPages"
                  name="totalPages"
                  inputMode="numeric"
                  key={book?.totalPages ?? ""}
                  defaultValue={book?.totalPages ?? ""}
                  placeholder="412"
                  aria-invalid={state.fieldErrors?.totalPages ? true : undefined}
                />
                <FieldError errors={fieldErrors(state, "totalPages")} />
              </Field>
            </div>
          </FieldSet>
        ) : null}

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
