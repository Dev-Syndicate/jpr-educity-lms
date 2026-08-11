import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireLibrarian } from "@/lib/dal";
import { formatShelfLocation } from "@/lib/shelf";
import { createClient } from "@/lib/supabase/server";
import {
  MATERIAL_CATEGORY_LABELS,
  isProjectCategory,
  type CopyStatus,
} from "@/lib/types";

import { CopiesPanel, type CopyRow } from "./copies-panel";

export default async function BookDetailPage(props: PageProps<"/books/[id]">) {
  await requireLibrarian();
  const { id } = await props.params;

  const supabase = await createClient();

  // All four together — none depends on another's result, and each is a
  // separate trip to Mumbai.
  const [{ data: book }, { data: copies }, { data: openLoans }, { data: authors }] =
    await Promise.all([
      supabase
        .from("books")
        .select(
          "id, title, author, isbn, publisher, edition, year, category, department, call_no, language, description, total_pages, invoice_no, invoice_date, distributor, price, project_no, degree, batch_month",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("book_copies")
        .select("id, accession_number, status, row_no, rack_no, section")
        .eq("book_id", id)
        .order("accession_number"),
      supabase
        .from("v_loans_with_fine")
        .select("copy_id, member_name, due_date")
        .eq("book_id", id)
        .is("returned_at", null),
      supabase
        .from("project_authors")
        .select("roll_number, full_name")
        .eq("book_id", id)
        .order("position"),
    ]);

  if (!book) notFound();

  const borrowers = new Map(
    (openLoans ?? []).map((l) => [l.copy_id, l]),
  );

  const rows: CopyRow[] = (copies ?? []).map((copy) => {
    const loan = borrowers.get(copy.id);
    return {
      id: copy.id,
      accession_number: copy.accession_number,
      status: copy.status as CopyStatus,
      row_no: copy.row_no,
      rack_no: copy.rack_no,
      section: copy.section,
      borrower: loan?.member_name ?? null,
      due_date: loan?.due_date ?? null,
    };
  });

  // Where to walk to. Copies of one title usually share a shelf, so a single
  // value answers it; when they are split, say so rather than pick one.
  //
  // The call number is deliberately NOT passed into each copy's string here:
  // it is one value for the title, so on a split shelf it would repeat in
  // every branch ("530 · Row 09…, 530 · Row 11…"). It is prefixed once below
  // instead, which is also how the rack label reads it.
  const shelves = [
    ...new Set(
      rows
        .map((copy) =>
          formatShelfLocation({
            rowNo: copy.row_no,
            rackNo: copy.rack_no,
            section: copy.section,
          }),
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const placed = shelves.length ? shelves.join(", ") : null;

  // "530 · Row 09 · Rack 01 · Sec A", or just "530" for a title that is
  // classified but not yet shelved — which is still worth showing.
  const shelf =
    [book.call_no?.trim() || null, placed].filter(Boolean).join(" · ") || null;

  const isProject = isProjectCategory(book.category);

  // A project has no ISBN, publisher, edition or language, and its author is
  // the student list shown in its own card below — so those rows are dropped
  // rather than rendered against blanks.
  const details = (
    isProject
      ? [
          ["Location", shelf],
          ["Category", MATERIAL_CATEGORY_LABELS[book.category]],
          ["Department", book.department],
        ]
      : [
          ["Author", book.author],
          ["Location", shelf],
          ["ISBN", book.isbn],
          ["Publisher", book.publisher],
          ["Edition", book.edition],
          ["Year", book.year],
          // The stored value is an enum like "non_book_material"; show the label.
          [
            "Category",
            book.category ? MATERIAL_CATEGORY_LABELS[book.category] : null,
          ],
          ["Department", book.department],
          ["Language", book.language],
          ["Total pages", book.total_pages],
        ]
  ).filter(([, value]) => value != null && value !== "");

  // Kept as its own list so the card can be omitted entirely when nothing was
  // recorded — an "Acquisition" heading over five dashes is worse than no
  // heading, and a donated item legitimately has none of this.
  const acquisition = [
    ["Invoice no.", book.invoice_no],
    ["Invoice date", book.invoice_date],
    ["Distributor", book.distributor],
    // toFixed(2) matches how every other rupee figure is shown here.
    ["Price", book.price != null ? `₹${Number(book.price).toFixed(2)}` : null],
  ].filter(([, value]) => value != null && value !== "");

  const project = [
    ["Project no.", book.project_no],
    ["Degree", book.degree],
    ["Batch", book.batch_month],
  ].filter(([, value]) => value != null && value !== "");

  const students = authors ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">{book.title}</h2>
          <p className="text-muted-foreground">{book.author}</p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href={`/books/${book.id}/edit`}>
              <PencilIcon />
              Edit
            </Link>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          {book.description ? (
            <CardDescription>{book.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <DetailList rows={details} />
        </CardContent>
      </Card>

      {/* Project or thesis only, and only once something has been recorded —
          PRD B-11 keeps these fields off every other category. */}
      {project.length || students.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {book.category === "thesis" ? "Thesis" : "Project"} details
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {project.length ? <DetailList rows={project} /> : null}

            {students.length ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-sm">
                  {students.length === 1 ? "Student" : "Students"}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {students.map((student) => (
                    <li
                      key={student.roll_number}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span className="font-medium">{student.full_name}</span>
                      <span className="text-muted-foreground font-mono">
                        {student.roll_number}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {acquisition.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Acquisition</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList rows={acquisition} />
          </CardContent>
        </Card>
      ) : null}

      <CopiesPanel bookId={book.id} copies={rows} />
    </div>
  );
}

/**
 * A label/value grid, shared by the three cards above so they stay identical
 * rather than drifting apart one copy-paste at a time.
 *
 * Callers filter out empty values before passing them in, which is what lets
 * a card be dropped entirely when it would otherwise be all dashes.
 */
function DetailList({ rows }: { rows: (string | number | null)[][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={String(label)} className="flex justify-between gap-4 text-sm">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
