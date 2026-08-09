import { notFound } from "next/navigation";

import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { BookForm } from "../../book-form";

export const metadata = { title: "Edit book · Jeppiaar Educity Library" };

export default async function EditBookPage(props: PageProps<"/books/[id]/edit">) {
  await requireLibrarian();
  const { id } = await props.params;

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("books")
    .select(
      "id, title, author, isbn, publisher, edition, year, category, language, description",
    )
    .eq("id", id)
    .maybeSingle();

  if (!book) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Edit book</h2>
        <p className="text-muted-foreground text-sm">{book.title}</p>
      </div>
      <BookForm book={book} />
    </div>
  );
}
