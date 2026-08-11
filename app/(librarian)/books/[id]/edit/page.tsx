import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { BookForm } from "../../book-form";

export const metadata = { title: "Edit book" };

export default async function EditBookPage(props: PageProps<"/books/[id]/edit">) {
  await requireLibrarian();
  const { id } = await props.params;

  const supabase = await createClient();

  // Independent queries, so they go together rather than one after the other.
  // The author list is fetched even for an ordinary book: it is one indexed
  // lookup that returns nothing, and branching on the category would mean
  // waiting for the book row first — turning one round trip into two.
  const [{ data: book }, { data: authors }] = await Promise.all([
    supabase
      .from("books")
      .select(
        "id, title, author, isbn, publisher, edition, year, category, department, call_no, language, description, total_pages, invoice_no, invoice_date, distributor, price, project_no, degree, batch_month",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("project_authors")
      .select("roll_number, full_name")
      .eq("book_id", id)
      .order("position"),
  ]);

  if (!book) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 self-center">
      <div className="flex flex-col gap-2">
        <BackLink href={`/books/${book.id}`} label={book.title} />
        <h2 className="text-xl font-semibold tracking-tight">Edit book</h2>
      </div>
      {/* The row is snake_case and the form takes camelCase, so the mapping is
          spelled out rather than spread — a silent rename would just leave the
          field blank with nothing to catch it. */}
      <BookForm
        book={{
          ...book,
          callNo: book.call_no,
          totalPages: book.total_pages,
          invoiceNo: book.invoice_no,
          invoiceDate: book.invoice_date,
          distributor: book.distributor,
          price: book.price,
          projectNo: book.project_no,
          degree: book.degree,
          batchMonth: book.batch_month,
          authors: (authors ?? []).map((student) => ({
            rollNumber: student.roll_number,
            fullName: student.full_name,
          })),
        }}
      />
    </div>
  );
}
