import { BackLink } from "@/components/back-link";
import { requireLibrarian } from "@/lib/dal";

import { BookForm } from "../book-form";

export const metadata = { title: "Add book" };

export default async function NewBookPage() {
  await requireLibrarian();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/books" label="Books" />
        <h2 className="text-xl font-semibold tracking-tight">Add a book</h2>
        <p className="text-muted-foreground text-sm">
          Create the title, then its physical copies.
        </p>
      </div>
      <BookForm />
    </div>
  );
}
