import { BookOpenIcon, ScanBarcodeIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";

import { ListPagination } from "@/components/list-pagination";
import { LoanActions } from "@/components/loan-actions";
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

export const metadata = { title: "Loans · Jeppiaar Educity Library" };

const PAGE_SIZE = 25;

const TABS = [
  { key: "all", label: "All" },
  { key: "due-today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
];

export default async function LoansPage(props: PageProps<"/loans">) {
  await requireLibrarian();

  const { filter, q, page } = await props.searchParams;
  const active = typeof filter === "string" ? filter : "all";
  const query = typeof q === "string" ? q.trim() : "";
  const pageNo = Math.max(1, Number(page) || 1);
  const from = (pageNo - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data: today } = await supabase.rpc("today_ist");

  let request = supabase
    .from("v_loans_with_fine")
    .select(
      "id, book_title, accession_number, member_name, member_roll_number, due_date, is_overdue, days_overdue, fine_outstanding, renewal_count",
      { count: "exact" },
    )
    .is("returned_at", null)
    .order("due_date")
    .range(from, from + PAGE_SIZE - 1);

  if (active === "overdue") request = request.eq("is_overdue", true);
  if (active === "due-today" && today) request = request.eq("due_date", today);

  if (query) {
    request = request.or(
      `book_title.ilike.%${query}%,accession_number.ilike.%${query}%,member_name.ilike.%${query}%,member_roll_number.ilike.%${query}%`,
    );
  }

  const { data: loans, count } = await request;
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Scoped to the search, so a count never promises rows the search excludes.
  const countFor = async (key: string) => {
    let counter = supabase
      .from("v_loans_with_fine")
      .select("id", { count: "exact", head: true })
      .is("returned_at", null);
    if (key === "overdue") counter = counter.eq("is_overdue", true);
    if (key === "due-today" && today) counter = counter.eq("due_date", today);
    if (query) {
      counter = counter.or(
        `book_title.ilike.%${query}%,accession_number.ilike.%${query}%,member_name.ilike.%${query}%,member_roll_number.ilike.%${query}%`,
      );
    }
    return (await counter).count ?? 0;
  };

  const counts = Object.fromEntries(
    await Promise.all(TABS.map(async (t) => [t.key, await countFor(t.key)])),
  ) as Record<string, number>;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={active === tab.key ? "default" : "outline"}
              size="sm"
              nativeButton={false}
              render={
                <Link
                  // Carry the search across tabs — switching filter should
                  // narrow the current search, not silently discard it.
                  href={`/loans?${new URLSearchParams({ filter: tab.key, ...(query && { q: query }) })}`}
                >
                  {tab.label}
                  <span className="tabular-nums opacity-60">
                    {counts[tab.key]}
                  </span>
                </Link>
              }
            />
          ))}
        </div>
        <SearchField placeholder="Search book, serial no. or member" />
      </div>

      {!loans?.length ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12">
              {query ? (
                <SearchXIcon className="text-muted-foreground size-6" />
              ) : (
                <BookOpenIcon className="text-muted-foreground size-6" />
              )}
            </EmptyMedia>
            <EmptyTitle>{query ? "No matches" : "Nothing here"}</EmptyTitle>
            <EmptyDescription>
              {query
                ? `No loan matches “${query}”.`
                : active === "overdue"
                  ? "No book is overdue."
                  : active === "due-today"
                    ? "Nothing is due today."
                    : "No books are currently on loan."}
            </EmptyDescription>
          </EmptyHeader>
          {!query ? (
            <EmptyContent>
              <Button
                nativeButton={false}
                render={
                  <Link href="/counter">
                    <ScanBarcodeIcon />
                    Issue a book
                  </Link>
                }
              />
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell>
                    <div className="font-medium">{loan.book_title}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {loan.accession_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{loan.member_name}</div>
                    <div className="text-muted-foreground text-xs">
                      {loan.member_roll_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{loan.due_date}</div>
                    {loan.is_overdue ? (
                      <Badge className="bg-overdue-subtle text-overdue mt-1">
                        {loan.days_overdue}d late · ₹
                        {Number(loan.fine_outstanding ?? 0).toFixed(2)}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <LoanActions
                      loanId={loan.id!}
                      accessionNumber={loan.accession_number!}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ListPagination
        page={pageNo}
        lastPage={lastPage}
        total={total}
        basePath="/loans"
        params={{ q: query, filter: active === "all" ? undefined : active }}
        label="on loan"
      />
    </div>
  );
}
