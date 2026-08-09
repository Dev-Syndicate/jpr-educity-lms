"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";

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

  const copies = Number(formData.get("copies") ?? 0);
  if (!Number.isInteger(copies) || copies < 0 || copies > 200) {
    return failure("Number of copies must be between 0 and 200.", {
      copies: ["Enter a number between 0 and 200."],
    });
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

  if (copies > 0) {
    const added = await addCopiesFor(data.id, copies);
    if (added) return failure(added);
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

/** Generate `count` accession numbers and insert copies. Returns an error string. */
async function addCopiesFor(bookId: string, count: number): Promise<string | null> {
  const supabase = await createClient();

  const rows: { book_id: string; accession_number: string }[] = [];
  for (let i = 0; i < count; i++) {
    const { data, error } = await supabase.rpc("next_accession_number");
    if (error || !data) return "Could not generate accession numbers.";
    rows.push({ book_id: bookId, accession_number: data });
  }

  const { error } = await supabase.from("book_copies").insert(rows);
  return error ? rpcErrorMessage(error, "Could not add copies.") : null;
}

export async function addCopies(
  _prev: ActionState<{ created: number }>,
  formData: FormData,
): Promise<ActionState<{ created: number }>> {
  await requireLibrarian();

  const bookId = String(formData.get("bookId") ?? "");
  const count = Number(formData.get("count") ?? 0);

  if (!z.uuid().safeParse(bookId).success) return failure("That book no longer exists.");
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return failure("Enter a number between 1 and 200.", {
      count: ["Between 1 and 200."],
    });
  }

  const error = await addCopiesFor(bookId, count);
  if (error) return failure(error);

  refresh();
  return success({ created: count }, `Added ${count} cop${count === 1 ? "y" : "ies"}.`);
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
  if (!/^JPR-\d{5}$/.test(accession)) return failure("Invalid accession number.");

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
