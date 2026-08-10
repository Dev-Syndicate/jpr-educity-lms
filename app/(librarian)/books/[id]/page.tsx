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
import { MATERIAL_CATEGORY_LABELS, type CopyStatus } from "@/lib/types";

import { CopiesPanel, type CopyRow } from "./copies-panel";

export default async function BookDetailPage(props: PageProps<"/books/[id]">) {
  await requireLibrarian();
  const { id } = await props.params;

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("books")
    .select(
      "id, title, author, isbn, publisher, edition, year, category, department, language, description",
    )
    .eq("id", id)
    .maybeSingle();

  if (!book) notFound();

  const [{ data: copies }, { data: openLoans }] = await Promise.all([
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
  ]);

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
  const shelf = shelves.length ? shelves.join(", ") : null;

  const details = [
    ["Author", book.author],
    ["Location", shelf],
    ["ISBN", book.isbn],
    ["Publisher", book.publisher],
    ["Edition", book.edition],
    ["Year", book.year],
    // The stored value is an enum like "non_book_material"; show the label.
    ["Category", book.category ? MATERIAL_CATEGORY_LABELS[book.category] : null],
    ["Department", book.department],
    ["Language", book.language],
  ].filter(([, value]) => value != null && value !== "");

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
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-4 text-sm">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <CopiesPanel bookId={book.id} copies={rows} />
    </div>
  );
}
