import { CheckCircle2Icon, SearchXIcon } from "lucide-react";

import { ListPagination } from "@/components/list-pagination";
import { SearchField } from "@/components/search-field";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Empty,
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

import { FineActions } from "./fine-actions";

export const metadata = { title: "Fines" };

const PAGE_SIZE = 25;

export default async function FinesPage(props: PageProps<"/fines">) {
  await requireLibrarian();

  const { q, page } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(page) || 1);
  const from = (pageNo - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // A search has to reach the member's name and the book's title, neither of
  // which lives on `fines`. Marking those embeds `!inner` turns them into joins
  // so a filter on them constrains the fine rows themselves.
  const embeds = query
    ? "profiles!fines_member_id_fkey!inner(full_name, roll_number), loans!inner(book_id, books!inner(title))"
    : "profiles!fines_member_id_fkey(full_name, roll_number), loans(book_id, books(title))";

  let request = supabase
    .from("fines")
    .select(`id, amount, assessed_at, member_id, loan_id, ${embeds}`, {
      count: "exact",
    })
    .eq("is_paid", false)
    .eq("is_waived", false)
    .not("assessed_at", "is", null)
    .order("assessed_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (query) {
    // Dotted paths reach through the inner joins, so one or() spans the
    // member and the book title together.
    request = request.or(
      `profiles.full_name.ilike.%${query}%,profiles.roll_number.ilike.%${query}%,loans.books.title.ilike.%${query}%`,
    );
  }

  const { data: fines, count } = await request;
  const matches = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(matches / PAGE_SIZE));

  // Summing the page would under-report the moment there is a second page, so
  // the headline total comes from every unpaid fine regardless of paging.
  const { data: allUnpaid } = await supabase
    .from("fines")
    .select("amount")
    .eq("is_paid", false)
    .eq("is_waived", false)
    .not("assessed_at", "is", null);

  const total = (allUnpaid ?? []).reduce(
    (sum, f) => sum + Number(f.amount ?? 0),
    0,
  );

  // "Is there anything to search?" is a different question from "did this
  // search match?" — the field stays put when a query comes back empty, or it
  // would vanish along with the results and strand the librarian.
  const hasFines = total > 0 || Boolean(fines?.length);

  return (
    <div className="flex flex-1 flex-col gap-4">
      {hasFines ? (
        <div className="flex flex-wrap items-center gap-3">
          <SearchField placeholder="Search member, roll number or book" />
        </div>
      ) : null}

      {!fines?.length ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className={query ? "size-12" : "bg-available-subtle size-12"}
            >
              {query ? (
                <SearchXIcon className="text-muted-foreground size-6" />
              ) : (
                <CheckCircle2Icon className="text-available size-6" />
              )}
            </EmptyMedia>
            <EmptyTitle>{query ? "No matches" : "No outstanding fines"}</EmptyTitle>
            <EmptyDescription>
              {query
                ? `No unpaid fine matches “${query}”.`
                : "Fines appear here once a book is returned late or an overdue book is brought to the counter."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {matches} unpaid
            {query ? " matching" : ""} ·{" "}
            <span className="text-overdue font-medium">₹{total.toFixed(2)}</span> outstanding
          </p>

          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Book</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fines.map((fine) => {
                  const member = fine.profiles as { full_name: string; roll_number: string | null } | null;
                  const loan = fine.loans as { books: { title: string } | null } | null;
                  const amount = Number(fine.amount ?? 0);

                  return (
                    <TableRow key={fine.id}>
                      <TableCell>
                        <div className="font-medium">{member?.full_name ?? "—"}</div>
                        <div className="text-muted-foreground text-xs">
                          {member?.roll_number ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {loan?.books?.title ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-overdue-subtle text-overdue">
                          ₹{amount.toFixed(2)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <FineActions
                          fineId={fine.id}
                          amount={amount}
                          memberName={member?.full_name ?? "this member"}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          <ListPagination
            page={pageNo}
            lastPage={lastPage}
            total={matches}
            basePath="/fines"
            params={{ q: query }}
            label="fines"
          />
        </>
      )}
    </div>
  );
}
