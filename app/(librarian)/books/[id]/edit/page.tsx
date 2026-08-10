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
  const { data: book } = await supabase
    .from("books")
    .select(
      "id, title, author, isbn, publisher, edition, year, category, department, language, description",
    )
    .eq("id", id)
    .maybeSingle();

  if (!book) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href={`/books/${book.id}`} label={book.title} />
        <h2 className="text-xl font-semibold tracking-tight">Edit book</h2>
      </div>
      <BookForm book={book} />
    </div>
  );
}
