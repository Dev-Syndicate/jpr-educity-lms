import { LibraryBigIcon, PlusIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";

import { ListPagination } from "@/components/list-pagination";
import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS,
  type MaterialCategory,
} from "@/lib/types";

import { BookDelete } from "./book-delete";

export const metadata = { title: "Books" };

const PAGE_SIZE = 25;

export default async function BooksPage(props: PageProps<"/books">) {
  await requireLibrarian();

  const { q, page, category } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(page) || 1);
  const from = (pageNo - 1) * PAGE_SIZE;

  // Never trust the URL: an unknown ?category= is ignored rather than passed
  // to Postgres, which would reject it as an invalid enum and 500 the page.
  const activeCategory = MATERIAL_CATEGORIES.includes(category as MaterialCategory)
    ? (category as MaterialCategory)
    : null;

  const supabase = await createClient();
  let request = supabase
    .from("v_books_catalogue")
    .select(
      "id, title, author, isbn, category, department, total_copies, available_copies",
      { count: "exact" },
    )
    .order("title")
    .range(from, from + PAGE_SIZE - 1);

  if (activeCategory) request = request.eq("category", activeCategory);

  if (query) {
    // Trigram indexes make these partial matches fast.
    request = request.or(
      `title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%`,
    );
  }

  // Copy counts for the whole filtered set, not just this page — paging must
  // not change the headline. Same filters as above, no .range().
  let copiesRequest = supabase
    .from("v_books_catalogue")
    .select("total_copies, available_copies");

  if (activeCategory) copiesRequest = copiesRequest.eq("category", activeCategory);
  if (query) {
    copiesRequest = copiesRequest.or(
      `title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%`,
    );
  }

  // Independent queries, so they go together rather than one after the other.
  const [{ data: books, count }, { data: allRows }] = await Promise.all([
    request,
    copiesRequest,
  ]);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const copyTotals = (allRows ?? []).reduce(
    (sums, row) => ({
      total: sums.total + Number(row.total_copies ?? 0),
      available: sums.available + Number(row.available_copies ?? 0),
    }),
    { total: 0, available: 0 },
  );

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search title, author or ISBN" />
        <Button
          className="ml-auto"
          nativeButton={false}
          render={
            <Link href="/books/new">
              <PlusIcon />
              Add book
            </Link>
          }
        />
      </div>

      {!books?.length ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12">
              {query || activeCategory ? (
                <SearchXIcon className="text-muted-foreground size-6" />
              ) : (
                <LibraryBigIcon className="text-muted-foreground size-6" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {query || activeCategory ? "No matches" : "No books yet"}
            </EmptyTitle>
            <EmptyDescription>
              {/* A filtered-but-empty list is not an empty catalogue, and must
                  not tell the librarian to add their first book. */}
              {query && activeCategory
                ? `No ${MATERIAL_CATEGORY_LABELS[activeCategory].toLowerCase()} matches “${query}”.`
                : activeCategory
                  ? `Nothing in ${MATERIAL_CATEGORY_LABELS[activeCategory].toLowerCase()} yet.`
                  : query
                    ? `Nothing matches “${query}”.`
                    : "Add your first book to start the catalogue."}
            </EmptyDescription>
          </EmptyHeader>
          {!query && !activeCategory ? (
            <EmptyContent>
              <Button
                nativeButton={false}
                render={
                  <Link href="/books/new">
                    <PlusIcon />
                    Add a book
                  </Link>
                }
              />
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          {/* A title is not a book on a shelf, so both numbers are shown: the
              count of titles this page is listing, and the physical copies
              behind them. Copies are summed across the whole filtered set,
              not just this page, or the figure would change as you paginate. */}
          <p className="text-muted-foreground text-sm">
            {total} {total === 1 ? "title" : "titles"}
            {activeCategory
              ? ` in ${MATERIAL_CATEGORY_LABELS[activeCategory].toLowerCase()}`
              : ""}
            {query ? " matching" : ""} ·{" "}
            <span className="font-medium">{copyTotals.total}</span>{" "}
            {copyTotals.total === 1 ? "copy" : "copies"} ·{" "}
            <span className="text-available font-medium">
              {copyTotals.available}
            </span>{" "}
            available
          </p>

          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  {/* w-0 shrinks to the button; the label is present but
                      hidden, so the column is not nameless to a screen
                      reader while staying visually quiet. */}
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.map((book) => (
                  <TableRow key={book.id}>
                    <TableCell>
                      <Link
                        href={`/books/${book.id}`}
                        className="font-medium hover:underline"
                      >
                        {book.title}
                      </Link>
                      {book.isbn ? (
                        <div className="text-muted-foreground font-mono text-xs">
                          {book.isbn}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{book.author}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {book.category
                        ? MATERIAL_CATEGORY_LABELS[book.category]
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {book.department ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        className={
                          (book.available_copies ?? 0) > 0
                            ? "bg-available-subtle text-available"
                            : "bg-issued-subtle text-issued"
                        }
                      >
                        {book.available_copies ?? 0} of {book.total_copies ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <BookDelete
                        bookId={book.id!}
                        title={book.title!}
                        copyCount={book.total_copies ?? 0}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <ListPagination
        page={pageNo}
        lastPage={lastPage}
        total={total}
        basePath="/books"
        // Carried through, or page 2 of "Thesis" silently shows everything.
        params={{ q: query, category: activeCategory ?? "" }}
        label="titles"
      />
    </div>
  );
}
