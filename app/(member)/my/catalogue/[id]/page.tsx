import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireApprovedMember } from "@/lib/dal";
import { formatShelfLocation } from "@/lib/shelf";
import { createClient } from "@/lib/supabase/server";
import { MATERIAL_CATEGORY_LABELS, isProjectCategory } from "@/lib/types";

export const metadata = { title: "Book details" };

/**
 * A catalogue entry, as a member sees it.
 *
 * Read-only, and deliberately narrower than the librarian's page at
 * /books/[id]. Three things are withheld rather than merely unlinked:
 *
 *   - Acquisition (invoice, distributor, price). Internal procurement data;
 *     no member has a reason to know what the library paid.
 *   - Per-copy rows. The shelf columns are read to work out where the title
 *     sits, but they are aggregated to a location string — no accession
 *     numbers, no per-copy status. A member needs "can I borrow this today",
 *     not an inventory.
 *   - Who holds a copy, and its due date. That is another member's borrowing
 *     history, and naming them here would leak it to anyone who looks up a
 *     popular title.
 *
 * What is shown is what helps someone decide to walk to the counter: whether
 * a copy is free, and where it sits.
 *
 * Every table read here is already readable by an approved member under the
 * existing policies — v_books_catalogue is `security_invoker`, and books,
 * book_copies and project_authors all gate SELECT on is_approved_user(). No
 * new policy or migration was needed for this page.
 */
export default async function MemberBookPage(
  props: PageProps<"/my/catalogue/[id]">,
) {
  await requireApprovedMember();
  const { id } = await props.params;

  const supabase = await createClient();

  // Independent queries, so all three trips to Mumbai start together.
  //
  // total_pages is read from `books` because v_books_catalogue does not carry
  // it, and the copies query supplies the shelf — row/rack/section live on the
  // copy, not the title. Both tables are readable by an approved member under
  // the existing policies (copies_select_approved), so this needs no new grant.
  const [{ data: book }, { data: authors }, { data: copies }, { data: pages }] =
    await Promise.all([
      supabase
        .from("v_books_catalogue")
        .select(
          "id, title, author, isbn, publisher, edition, year, category, department, call_no, language, description, total_copies, available_copies",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("project_authors")
        .select("roll_number, full_name")
        .eq("book_id", id)
        .order("position"),
      // Only the shelf columns. Deliberately NOT accession numbers or status —
      // a member needs to know where to walk, not which copy is which, and the
      // per-copy detail is what would let them infer who holds what.
      supabase
        .from("book_copies")
        .select("row_no, rack_no, section")
        .eq("book_id", id),
      supabase.from("books").select("total_pages").eq("id", id).maybeSingle(),
    ]);

  if (!book) notFound();

  const available = book.available_copies ?? 0;
  const total = book.total_copies ?? 0;
  const isProject = isProjectCategory(book.category);

  // Where to walk to. Copies of one title usually share a shelf, so a single
  // value answers it; when they are split across shelves, say so rather than
  // pick one and send the member to the wrong rack.
  //
  // The call number is left out of each copy's string and shown on its own row
  // instead: it belongs to the title, so folding it in would repeat it in
  // every branch of a split shelf ("530 · Row 1…, 530 · Row 3…").
  const shelves = [
    ...new Set(
      (copies ?? [])
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
  const shelf = shelves.length ? shelves.join(", ") : null;

  // A project has no ISBN, publisher, edition or language, and its author is
  // the student list below — so those rows are dropped rather than rendered
  // against blanks. Mirrors the librarian page's treatment.
  const details = (
    isProject
      ? [
          ["Call number", book.call_no],
          ["Location", shelf],
          ["Category", book.category ? MATERIAL_CATEGORY_LABELS[book.category] : null],
          ["Department", book.department],
          ["Pages", pages?.total_pages ?? null],
        ]
      : [
          ["Author", book.author],
          ["Call number", book.call_no],
          ["Location", shelf],
          ["ISBN", book.isbn],
          ["Publisher", book.publisher],
          ["Edition", book.edition],
          ["Year", book.year],
          ["Category", book.category ? MATERIAL_CATEGORY_LABELS[book.category] : null],
          ["Department", book.department],
          ["Language", book.language],
          ["Pages", pages?.total_pages ?? null],
        ]
  ).filter(([, value]) => value != null && value !== "");

  const students = authors ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        nativeButton={false}
        render={
          <Link href="/my/catalogue">
            <ArrowLeftIcon />
            Back to catalogue
          </Link>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">{book.title}</h2>
          {!isProject ? (
            <p className="text-muted-foreground">{book.author}</p>
          ) : null}
        </div>

        <Badge
          className={
            available > 0
              ? "bg-available-subtle text-available"
              : "bg-issued-subtle text-issued"
          }
        >
          {available > 0
            ? `${available} of ${total} on the shelf`
            : `All ${total} out`}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          {book.description ? (
            <CardDescription>{book.description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <DetailList rows={details} />

          {/* No due date when everything is out: that would come from another
              member's loan, which is not this member's to see. */}
          <p className="text-muted-foreground border-t pt-4 text-sm">
            {available > 0
              ? "Bring your ID card to the library counter to borrow this."
              : "Every copy is on loan. Ask at the counter when one is due back."}
          </p>
        </CardContent>
      </Card>

      {students.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {book.category === "thesis" ? "Thesis" : "Project"} details
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** Same label/value grid as the librarian detail page. */
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
