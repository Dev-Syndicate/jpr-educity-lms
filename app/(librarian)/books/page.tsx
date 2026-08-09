import { PlusIcon } from "lucide-react";
import Link from "next/link";

import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
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

export const metadata = { title: "Books · Jeppiaar Educity Library" };

const PAGE_SIZE = 25;

export default async function BooksPage(props: PageProps<"/books">) {
  await requireLibrarian();

  const { q, page } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(page) || 1);
  const from = (pageNo - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let request = supabase
    .from("v_books_catalogue")
    .select("id, title, author, isbn, category, total_copies, available_copies", {
      count: "exact",
    })
    .order("title")
    .range(from, from + PAGE_SIZE - 1);

  if (query) {
    // Trigram indexes make these partial matches fast.
    request = request.or(
      `title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%`,
    );
  }

  const { data: books, count } = await request;
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
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
        <Empty>
          <EmptyTitle>{query ? "No matches" : "No books yet"}</EmptyTitle>
          <EmptyDescription>
            {query
              ? `Nothing matches “${query}”.`
              : "Add your first book to start the catalogue."}
          </EmptyDescription>
        </Empty>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Available</TableHead>
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
                    {book.category ?? "—"}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {lastPage > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pageNo} of {lastPage} · {total} titles
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pageNo <= 1}
              nativeButton={false}
              render={
                <Link
                  href={`/books?${new URLSearchParams({ ...(query && { q: query }), page: String(pageNo - 1) })}`}
                >
                  Previous
                </Link>
              }
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pageNo >= lastPage}
              nativeButton={false}
              render={
                <Link
                  href={`/books?${new URLSearchParams({ ...(query && { q: query }), page: String(pageNo + 1) })}`}
                >
                  Next
                </Link>
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
