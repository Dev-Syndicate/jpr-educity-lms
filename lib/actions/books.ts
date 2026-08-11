"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import {
  MATERIAL_CATEGORIES,
  failure,
  isProjectCategory,
  success,
  type ActionState,
  type MaterialCategory,
  type ProjectAuthor,
} from "@/lib/types";
import { parseAccessionNumbers } from "@/lib/accession";
import { formatShelfLocation, type ShelfLocation } from "@/lib/shelf";

const bookSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(300),
  // Optional HERE, not optional in general: a project posts no author box,
  // because its authors are its students. readBook() re-imposes the
  // requirement for every other category, and toRow() fills a project's from
  // the first student — books.author is NOT NULL and every existing screen
  // reads it, so it must always end up with a real name.
  author: z.string().trim().max(300).optional(),
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
  // A closed list, so anything off it is rejected here rather than left for
  // Postgres to refuse as an invalid enum input.
  category: z.enum(MATERIAL_CATEGORIES).optional(),
  department: z.string().trim().max(120).optional(),
  // Free text, not a number: "512.943 4" carries a decimal AND a space, and
  // some schemes append a Cutter suffix. Matches books_call_no_len.
  callNo: z
    .string()
    .trim()
    .max(40, "Keep the call number under 40 characters.")
    .optional(),
  language: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2000).optional(),

  // --- Acquisition (PRD B-10). All optional: a donation has no invoice. ---
  invoiceNo: z.string().trim().max(60).optional(),
  invoiceDate: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: "Enter the invoice date as YYYY-MM-DD.",
    })
    .optional(),
  distributor: z.string().trim().max(200).optional(),
  price: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && +v <= 9_999_999), {
      message: "Enter a price in rupees, e.g. 450 or 450.50.",
    })
    .optional(),
  totalPages: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 100000), {
      message: "Enter a page count between 1 and 100000.",
    })
    .optional(),

  // --- Project / thesis (PRD B-11) ---
  projectNo: z.string().trim().max(60).optional(),
  degree: z.string().trim().max(60).optional(),
  batchMonth: z.string().trim().max(40).optional(),
});

/**
 * Each part of a shelf address, uppercased so "a" and "A" cannot become two
 * different sections. Bounded to match the check constraints on book_copies.
 */
const shelfPart = z
  .string()
  .trim()
  .toUpperCase()
  .max(20, "Keep each part of the location under 20 characters.");

const shelfSchema = z.object({
  rowNo: shelfPart,
  rackNo: shelfPart,
  section: shelfPart,
});

/** Pull Row / Rack / Section off a form. All three are optional. */
function readShelf(formData: FormData) {
  return shelfSchema.safeParse({
    rowNo: formData.get("rowNo") ?? "",
    rackNo: formData.get("rackNo") ?? "",
    section: formData.get("section") ?? "",
  });
}

/**
 * Author is required for everything except a project or thesis, whose form
 * posts a student list instead of an author box.
 *
 * The check lives here rather than in the zod schema because it depends on
 * another field, and because "the box was not rendered" and "the box was left
 * blank" have to stay distinguishable — a blank author on a BOOK is still an
 * error worth reporting against that field.
 */
function readBook(formData: FormData) {
  const category = formData.get("category");
  const author = String(formData.get("author") ?? "").trim();

  if (!isProjectCategory(category as MaterialCategory) && !author) {
    return {
      success: false as const,
      error: new z.ZodError([
        {
          code: "custom" as const,
          path: ["author"],
          message: "Author is required.",
          input: author,
        },
      ]),
    };
  }

  return bookSchema.safeParse({
    title: formData.get("title"),
    author: formData.get("author") ?? undefined,
    isbn: formData.get("isbn") ?? undefined,
    publisher: formData.get("publisher") ?? undefined,
    edition: formData.get("edition") ?? undefined,
    year: formData.get("year") ?? undefined,
    category: formData.get("category") ?? undefined,
    department: formData.get("department") ?? undefined,
    callNo: formData.get("callNo") ?? undefined,
    language: formData.get("language") ?? undefined,
    description: formData.get("description") ?? undefined,
    invoiceNo: formData.get("invoiceNo") ?? undefined,
    invoiceDate: formData.get("invoiceDate") ?? undefined,
    distributor: formData.get("distributor") ?? undefined,
    price: formData.get("price") ?? undefined,
    totalPages: formData.get("totalPages") ?? undefined,
    projectNo: formData.get("projectNo") ?? undefined,
    degree: formData.get("degree") ?? undefined,
    batchMonth: formData.get("batchMonth") ?? undefined,
  });
}

function toRow(data: z.infer<typeof bookSchema>, authors: ProjectAuthor[] = []) {
  // NOT NULL in the database, so it falls back rather than nulling out.
  const category = data.category ?? "book";

  // A magazine has no project number. The database refuses the combination
  // outright (books_project_fields_need_project_category), so these are
  // cleared here rather than passed through to be rejected — and clearing on
  // every save is what makes re-categorising a thesis into a book work
  // instead of failing on a value the form no longer even shows.
  //
  // The same applies to the bibliographic fields: a project has no ISBN,
  // publisher or edition, and the form does not render those boxes. Nulling
  // them here is what makes re-categorising a BOOK into a project actually
  // drop its old ISBN rather than leave it stranded on a row that no longer
  // shows it.
  const isProject = isProjectCategory(category);

  return {
    title: data.title,
    // books.author is NOT NULL and drives the catalogue list, the counter
    // search and every loan screen. A project posts no author box, so the
    // first student stands as the author — which is who wrote it.
    author: isProject ? (authors[0]?.fullName ?? "Unknown") : data.author!,
    isbn: isProject ? null : data.isbn || null,
    publisher: isProject ? null : data.publisher || null,
    edition: isProject ? null : data.edition || null,
    year: !isProject && data.year ? Number(data.year) : null,
    category,
    department: data.department || null,
    // Kept for EVERY category, unlike the bibliographic fields above: a
    // thesis sits on a rack and is classified like anything else.
    call_no: data.callNo || null,
    language: isProject ? "English" : data.language || "English",
    description: isProject ? null : data.description || null,

    // Acquisition describes a purchase. A student submission was not bought,
    // so the form omits the whole block and these stay null.
    total_pages: !isProject && data.totalPages ? Number(data.totalPages) : null,
    invoice_no: isProject ? null : data.invoiceNo || null,
    invoice_date: isProject ? null : data.invoiceDate || null,
    distributor: isProject ? null : data.distributor || null,
    // Empty means "not recorded"; "0" is a real figure — a complimentary or
    // donated copy — so this tests for blank rather than falsiness, which
    // would file ₹0 as unknown. total_pages needs no such care: its
    // constraint puts the floor at 1, so 0 is not a valid value there.
    price:
      isProject || data.price === "" || data.price === undefined
        ? null
        : Number(data.price),

    project_no: isProject ? data.projectNo || null : null,
    degree: isProject ? data.degree || null : null,
    batch_month: isProject ? data.batchMonth || null : null,
  };
}

/**
 * The student rows off a project form.
 *
 * The form posts `authorRoll` and `authorName` once per student row, so both
 * arrive as parallel lists. A row with neither field filled is a blank the
 * librarian added and did not use — dropped silently. A row with only one of
 * the two is a half-finished entry and is an error worth showing, because
 * silently discarding it would lose a student the librarian believes they
 * just recorded.
 */
function readAuthors(formData: FormData): {
  authors?: ProjectAuthor[];
  error?: string;
} {
  const rolls = formData.getAll("authorRoll").map((v) => String(v).trim());
  const names = formData.getAll("authorName").map((v) => String(v).trim());

  const authors: ProjectAuthor[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < Math.max(rolls.length, names.length); i++) {
    const rollNumber = rolls[i] ?? "";
    const fullName = names[i] ?? "";

    if (!rollNumber && !fullName) continue;
    if (!rollNumber || !fullName) {
      return { error: "Every student needs both a roll number and a name." };
    }
    if (rollNumber.length > 40 || fullName.length > 200) {
      return { error: "That roll number or name is too long." };
    }

    // Matches project_authors_book_roll_unique, which is case-insensitive.
    // Caught here so the librarian gets the roll number back rather than a
    // raw 23505 naming an index.
    const key = rollNumber.toLowerCase();
    if (seen.has(key)) {
      return { error: `${rollNumber} is listed twice.` };
    }
    seen.add(key);

    authors.push({ rollNumber, fullName });
  }

  if (authors.length > 20) {
    return { error: "A project can list at most 20 students." };
  }

  return { authors };
}

/**
 * Replace a project's student list wholesale.
 *
 * Delete-then-insert rather than diffing: the list is at most a handful of
 * rows, it is always edited as a whole, and `position` renumbers whenever a
 * student is removed from the middle. A diff would be more code to arrive at
 * the same rows.
 */
async function saveAuthorsFor(
  bookId: string,
  authors: ProjectAuthor[],
): Promise<string | null> {
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("project_authors")
    .delete()
    .eq("book_id", bookId);

  if (clearError) {
    return rpcErrorMessage(clearError, "Could not update the student list.");
  }

  if (!authors.length) return null;

  const { error } = await supabase.from("project_authors").insert(
    authors.map((student, index) => ({
      book_id: bookId,
      roll_number: student.rollNumber,
      full_name: student.fullName,
      position: index + 1,
    })),
  );

  if (!error) return null;
  if (error.code === "23505") {
    return "The same roll number is listed twice.";
  }
  return rpcErrorMessage(error, "Could not save the student list.");
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

  // Validated before the book is inserted: a bad location should reject the
  // form, not leave a committed book whose copies silently lost their shelf.
  const shelf = readShelf(formData);
  if (!shelf.success) {
    return failure("Check the details below.", z.flattenError(shelf.error).fieldErrors);
  }

  // Same reasoning as the shelf: catch a half-filled student row now, while
  // the form can still be corrected, rather than after the title exists.
  const students = readAuthors(formData);
  if (students.error) {
    return failure(students.error, { authors: [students.error] });
  }

  const wantsStudents = isProjectCategory(parsed.data.category ?? "book");
  if (wantsStudents && !students.authors?.length) {
    // The project's author IS its first student, so an empty list would leave
    // books.author with nothing real to hold.
    const message = "Add at least one student.";
    return failure(message, { authors: [message] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .insert(toRow(parsed.data, students.authors ?? []))
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
    await addCopiesFor(data.id, numbers, shelf.data);
  }

  // Only for a project or thesis — for anything else the form did not show
  // the fields, and toRow() has already nulled the header to match.
  if (wantsStudents && students.authors?.length) {
    await saveAuthorsFor(data.id, students.authors);
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

  const students = readAuthors(formData);
  if (students.error) {
    return failure(students.error, { authors: [students.error] });
  }

  const isProject = isProjectCategory(parsed.data.category ?? "book");
  if (isProject && !students.authors?.length) {
    const message = "Add at least one student.";
    return failure(message, { authors: [message] });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("books")
    .update(toRow(parsed.data, students.authors ?? []))
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return failure("A book with that ISBN already exists.", {
        isbn: ["Already in the catalogue."],
      });
    }
    return failure(rpcErrorMessage(error, "Could not save this book."));
  }

  // Run for EVERY category, not only projects. Re-categorising a thesis into
  // a book must take its student list with it: toRow() has already cleared
  // the project number and degree, and leaving the authors behind would keep
  // named students attached to a row that no longer displays them.
  // saveAuthorsFor deletes first, so an empty list is exactly that clearing.
  const authorsError = await saveAuthorsFor(
    id,
    isProject ? (students.authors ?? []) : [],
  );
  if (authorsError) return failure(authorsError, { authors: [authorsError] });

  refresh();
  revalidatePath("/books");
  return success(undefined, "Saved.");
}

/**
 * Insert copies, all at the same shelf location.
 *
 * One location for the batch rather than one per accession number: copies
 * added together are copies of the same title arriving together, and they go
 * on the same shelf. Any that end up elsewhere are corrected inline in the
 * copies table, which is a rarer edit than typing the location once here.
 */
async function addCopiesFor(
  bookId: string,
  numbers: string[],
  location?: ShelfLocation,
): Promise<string | null> {
  const supabase = await createClient();

  const { error } = await supabase.from("book_copies").insert(
    numbers.map((accession_number) => ({
      book_id: bookId,
      accession_number,
      row_no: location?.rowNo || null,
      rack_no: location?.rackNo || null,
      section: location?.section || null,
    })),
  );

  if (!error) return null;

  // The accession number is typed by hand, so a clash is an ordinary typo and
  // deserves better than a raw 23505.
  if (error.code === "23505") {
    return "One of those accession numbers is already used by another copy.";
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

  const shelf = readShelf(formData);
  if (!shelf.success) {
    return failure(
      shelf.error.issues[0]?.message ?? "Check the location.",
      z.flattenError(shelf.error).fieldErrors,
    );
  }

  const error = await addCopiesFor(bookId, parsed.numbers, shelf.data);
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
    return failure("Invalid accession number.");
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
  /** Already formatted for display ("Row 09 · Rack 01 · Sec A"), or null. */
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
    .select("id, title, author, call_no, total_copies, available_copies")
    // Call number included: a librarian reading a rack label can type "530"
    // straight in. Prefix-matched rather than exact, so "512.9" narrows.
    .or(
      `title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%,call_no.ilike.${q}%`,
    )
    .order("title")
    .limit(6);

  if (!books?.length) return [];

  const ids = books.map((b) => b.id).filter((id): id is string => Boolean(id));

  // The call number is on the TITLE, so it is looked up per book and folded
  // into each copy's location string below.
  const callNoByBook = new Map(books.map((b) => [b.id, b.call_no]));

  // Copies and due dates for all hits in two queries rather than 2N.
  const [{ data: copies }, { data: loans }] = await Promise.all([
    supabase
      .from("book_copies")
      .select("book_id, accession_number, row_no, rack_no, section")
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
        shelfLocation: formatShelfLocation({
          callNo: callNoByBook.get(c.book_id),
          rowNo: c.row_no,
          rackNo: c.rack_no,
          section: c.section,
        }),
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

/**
 * Set (or clear) where a copy sits: Row / Rack / Section.
 *
 * Free text — read by a person walking to a shelf, not parsed. Each part is
 * independent, so a copy may have a row and no section yet. Blank clears that
 * part; clearing all three means "not shelved".
 */
export async function setCopyShelfLocation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  // Uppercased so "a" and "A" cannot become two different sections, matching
  // how accession numbers are normalised.
  const part = z
    .string()
    .trim()
    .toUpperCase()
    .max(20, "Keep each part under 20 characters.");

  const parsed = z
    .object({
      copyId: z.uuid(),
      rowNo: part,
      rackNo: part,
      section: part,
    })
    .safeParse({
      copyId: formData.get("copyId"),
      rowNo: formData.get("rowNo") ?? "",
      rackNo: formData.get("rackNo") ?? "",
      section: formData.get("section") ?? "",
    });

  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Could not save that location.");
  }

  const { rowNo, rackNo, section } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("book_copies")
    // Empty string means "cleared", which is NULL — the check constraints
    // reject a blank string precisely so the two cannot both mean "unknown".
    .update({
      row_no: rowNo || null,
      rack_no: rackNo || null,
      section: section || null,
    })
    .eq("id", parsed.data.copyId)
    .select("accession_number")
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not save that location."));

  const where = formatShelfLocation({ rowNo, rackNo, section });

  refresh();
  return success(
    undefined,
    where
      ? `${data.accession_number} is at ${where}.`
      : `Cleared the shelf location for ${data.accession_number}.`,
  );
}

/**
 * Delete a title, and optionally its copies with it.
 *
 * Deliberately narrow. `on delete restrict` on book_copies.book_id and on
 * loans.book_id means the database refuses to remove a title that anything
 * still points at, and this action does NOT work around that — it translates
 * the refusal into something a librarian can act on.
 *
 * Copies are removed first only when none of them has ever been on loan.
 * A copy with history is what keeps `loans` honest: DI-5 says loan history is
 * never deleted, so a title that has circulated stays in the catalogue.
 */
export async function deleteBook(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const bookId = String(formData.get("bookId") ?? "");
  if (!z.uuid().safeParse(bookId).success) {
    return failure("That book no longer exists.");
  }

  const supabase = await createClient();

  const { data: book } = await supabase
    .from("books")
    .select("id, title")
    .eq("id", bookId)
    .maybeSingle();

  if (!book) return failure("That book no longer exists.");

  // Any loan, open or returned, means this title has circulation history.
  const { count: loanCount } = await supabase
    .from("loans")
    .select("id", { count: "exact", head: true })
    .eq("book_id", bookId);

  if (loanCount) {
    return failure(
      `“${book.title}” has been borrowed before, so it cannot be deleted — its loan history has to stay. Remove its copies instead if it is off the shelves.`,
    );
  }

  // No history: the copies are safe to remove, and must go first or the
  // restrict on book_copies.book_id blocks the title.
  const { error: copiesError } = await supabase
    .from("book_copies")
    .delete()
    .eq("book_id", bookId);

  if (copiesError) {
    return failure(rpcErrorMessage(copiesError, "Could not delete those copies."));
  }

  const { error } = await supabase.from("books").delete().eq("id", bookId);

  if (error) {
    // 23503 = foreign key violation. Something still references this title
    // that the checks above did not anticipate, so say so rather than showing
    // the raw constraint name.
    if (error.code === "23503") {
      return failure(
        `“${book.title}” is still referenced elsewhere and cannot be deleted.`,
      );
    }
    return failure(rpcErrorMessage(error, "Could not delete that book."));
  }

  revalidatePath("/books");
  return success(undefined, `“${book.title}” was deleted.`);
}
