import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
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
import { requireApprovedMember } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Catalogue · Jeppiaar Educity Library" };

export default async function CataloguePage(props: PageProps<"/my/catalogue">) {
  await requireApprovedMember();

  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const supabase = await createClient();
  let request = supabase
    .from("v_books_catalogue")
    .select("id, title, author, category, total_copies, available_copies")
    .order("title")
    .limit(50);

  if (query) {
    request = request.or(
      `title.ilike.%${query}%,author.ilike.%${query}%,isbn.ilike.%${query}%`,
    );
  }

  const { data: books } = await request;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted-foreground text-sm">
          Borrow at the library counter.
        </p>
      </div>

      <SearchField placeholder="Search title, author or ISBN" />

      {!books?.length ? (
        <Empty>
          <EmptyTitle>No matches</EmptyTitle>
          <EmptyDescription>
            {query ? `Nothing matches “${query}”.` : "The catalogue is empty."}
          </EmptyDescription>
        </Empty>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="font-medium">{book.title}</TableCell>
                  <TableCell className="text-muted-foreground">{book.author}</TableCell>
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
    </div>
  );
}
