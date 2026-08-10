import { BackLink } from "@/components/back-link";
import { requireLibrarian } from "@/lib/dal";

import { BookForm } from "../book-form";

export const metadata = { title: "Add book" };

export default async function NewBookPage() {
  await requireLibrarian();

  return (
    // The heading and the form are one column: constrain and centre them
    // together here, so a wide screen does not strand the form on the left
    // with the title floating above a different width.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 self-center">
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
