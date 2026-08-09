"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";
import { parseAccessionNumbers } from "@/lib/accession";

const bookSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(300),
  author: z.string().trim().min(1, "Author is required.").max(300),
  isbn: z
    .string()
    .trim()
    .transform((v) => v.replace(/[-\s]/g, ""))
    .refine((v) => v === "" || /^[0-9]{9}[0-9Xx]$|^[0-9]{13}$/.test(v), {
      message: "ISBN must be 10 or 13 digits.",
    })
    .optional(),
  publisher: z.string().trim().max(200).optional(),
  edition: z.string().trim().max(100).optional(),
  year: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && +v >= 1400 && +v <= 2200), {
      message: "Enter a year between 1400 and 2200.",
    })
    .optional(),
  category: z.string().trim().max(120).optional(),
  language: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2000).optional(),
});

function readBook(formData: FormData) {
  return bookSchema.safeParse({
    title: formData.get("title"),
    author: formData.get("author"),
    isbn: formData.get("isbn") ?? undefined,
    publisher: formData.get("publisher") ?? undefined,
    edition: formData.get("edition") ?? undefined,
    year: formData.get("year") ?? undefined,
    category: formData.get("category") ?? undefined,
    language: formData.get("language") ?? undefined,
    description: formData.get("description") ?? undefined,
  });
}

function toRow(data: z.infer<typeof bookSchema>) {
  return {
    title: data.title,
    author: data.author,
    isbn: data.isbn || null,
    publisher: data.publisher || null,
    edition: data.edition || null,
    year: data.year ? Number(data.year) : null,
    category: data.category || null,
    language: data.language || "English",
    description: data.description || null,
  };
}

/**
 * On success this redirects, so it never returns a payload — typed as a plain
 * ActionState so it can share a form component with updateBook.
 */
export async function createBook(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const parsed = readBook(formData);
  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  // Optional: a title can be catalogued before its copies arrive.
  const rawCopies = String(formData.get("accessionNumbers") ?? "").trim();
  let numbers: string[] = [];
  if (rawCopies) {
    const copies = parseAccessionNumbers(rawCopies);
    if (copies.error || !copies.numbers) {
      return failure(copies.error!, { accessionNumbers: [copies.error!] });
    }
    numbers = copies.numbers;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .insert(toRow(parsed.data))
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return failure("A book with that ISBN already exists.", {
        isbn: ["Already in the catalogue."],
      });
    }
    return failure(rpcErrorMessage(error, "Could not save this book."));
  }

  // The book row is already committed. If a copy clashes, still go to the
  // book — its copies panel shows exactly what landed, and the number can be
  // corrected there. Returning a failure here would strand the librarian on a
  // form for a book that now exists, so re-submitting would fail on the ISBN.
  if (numbers.length) {
    await addCopiesFor(data.id, numbers);
  }

  revalidatePath("/books");
  redirect(`/books/${data.id}`);
}

export async function updateBook(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return failure("That book no longer exists.");

  const parsed = readBook(formData);
  if (!parsed.success) {
    return failure("Check the details below.", z.flattenError(parsed.error).fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("books").update(toRow(parsed.data)).eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return failure("A book with that ISBN already exists.", {
        isbn: ["Already in the catalogue."],
      });
    }
    return failure(rpcErrorMessage(error, "Could not save this book."));
  }

  refresh();
  revalidatePath("/books");
  return success(undefined, "Saved.");
}

async function addCopiesFor(
  bookId: string,
  numbers: string[],
): Promise<string | null> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("book_copies")
    .insert(numbers.map((accession_number) => ({ book_id: bookId, accession_number })));

  if (!error) return null;

  // The accession number is typed by hand, so a clash is an ordinary typo and
  // deserves better than a raw 23505.
  if (error.code === "23505") {
    return "One of those serial numbers is already used by another copy.";
  }
  return rpcErrorMessage(error, "Could not add copies.");
}

export async function addCopies(
  _prev: ActionState<{ created: number }>,
  formData: FormData,
): Promise<ActionState<{ created: number }>> {
  await requireLibrarian();

  const bookId = String(formData.get("bookId") ?? "");
  if (!z.uuid().safeParse(bookId).success) return failure("That book no longer exists.");

  const parsed = parseAccessionNumbers(String(formData.get("accessionNumbers") ?? ""));
  if (parsed.error || !parsed.numbers) {
    return failure(parsed.error!, { accessionNumbers: [parsed.error!] });
  }

  const error = await addCopiesFor(bookId, parsed.numbers);
  if (error) return failure(error, { accessionNumbers: [error] });

  const created = parsed.numbers.length;
  refresh();
  return success({ created }, `Added ${created} cop${created === 1 ? "y" : "ies"}.`);
}

export async function setCopyStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const parsed = z
    .object({
      copyId: z.uuid(),
      status: z.enum(["available", "lost", "damaged"]),
    })
    .safeParse({
      copyId: formData.get("copyId"),
      status: formData.get("status"),
    });

  if (!parsed.success) return failure("Could not update that copy.");

  const supabase = await createClient();

  // A copy that is out cannot be quietly retired — the loan must be closed
  // first, which mark_copy_lost() does properly.
  const { data: copy } = await supabase
    .from("book_copies")
    .select("status, accession_number")
    .eq("id", parsed.data.copyId)
    .single();

  if (copy?.status === "issued") {
    return failure(
      `${copy.accession_number} is currently on loan. Return it first, or mark it lost.`,
    );
  }

  const { error } = await supabase
    .from("book_copies")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.copyId);

  if (error) return failure(rpcErrorMessage(error, "Could not update that copy."));

  refresh();
  return success(undefined, "Copy updated.");
}

export async function markCopyLost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const accession = String(formData.get("accessionNumber") ?? "").trim().toUpperCase();
  if (!accession || accession.length > 50) {
    return failure("Invalid serial number.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .rpc("mark_copy_lost", {
      p_accession_number: accession,
      p_note: String(formData.get("note") ?? "") || undefined,
    })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not mark that copy lost."));

  refresh();
  return success(undefined, `${accession} marked lost. Any open loan was closed.`);
}

export type CopyHit = {
  accessionNumber: string;
  shelfLocation: string | null;
};

export type BookHit = {
  id: string;
  title: string;
  author: string;
  totalCopies: number;
  availableCopies: number;
  /** Only the copies that can be issued right now, capped for display. */
  available: CopyHit[];
  /** Earliest due date among the copies out, when none are on the shelf. */
  nextDue: string | null;
};

/**
 * Counter book lookup: "do we have this, and which copy do I fetch?"
 *
 * Returns the accession numbers of AVAILABLE copies so the librarian can read
 * one off, pull it from the shelf and scan it. When nothing is on the shelf it
 * returns the earliest due date instead, which is the next question asked.
 */
export async function searchBooks(query: string): Promise<BookHit[]> {
  await requireLibrarian();

  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  const { data: books } = await supabase
    .from("v_books_catalogue")
    .select("id, title, author, total_copies, available_copies")
    .or(`title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%`)
    .order("title")
    .limit(6);

  if (!books?.length) return [];

  const ids = books.map((b) => b.id).filter((id): id is string => Boolean(id));

  // Copies and due dates for all hits in two queries rather than 2N.
  const [{ data: copies }, { data: loans }] = await Promise.all([
    supabase
      .from("book_copies")
      .select("book_id, accession_number, shelf_location")
      .in("book_id", ids)
      .eq("status", "available")
      .order("accession_number"),
    supabase
      .from("v_loans_with_fine")
      .select("book_id, due_date")
      .in("book_id", ids)
      .is("returned_at", null)
      .order("due_date"),
  ]);

  const byBook = new Map<string, CopyHit[]>();
  for (const c of copies ?? []) {
    if (!c.book_id) continue;
    const list = byBook.get(c.book_id) ?? [];
    // Three is enough to read one out; more is noise at the counter.
    if (list.length < 3) {
      list.push({
        accessionNumber: c.accession_number,
        shelfLocation: c.shelf_location,
      });
    }
    byBook.set(c.book_id, list);
  }

  // Ordered by due_date, so the first hit per book is the earliest.
  const dueByBook = new Map<string, string>();
  for (const l of loans ?? []) {
    if (l.book_id && l.due_date && !dueByBook.has(l.book_id)) {
      dueByBook.set(l.book_id, l.due_date);
    }
  }

  return books.map((b) => ({
    id: b.id!,
    title: b.title!,
    author: b.author!,
    totalCopies: Number(b.total_copies ?? 0),
    availableCopies: Number(b.available_copies ?? 0),
    available: byBook.get(b.id!) ?? [],
    nextDue: dueByBook.get(b.id!) ?? null,
  }));
}
