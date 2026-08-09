import Link from "next/link";

import { LoanActions } from "@/components/loan-actions";
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

export const metadata = { title: "Loans · Jeppiaar Educity Library" };

const TABS = [
  { key: "all", label: "All" },
  { key: "due-today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
];

export default async function LoansPage(props: PageProps<"/loans">) {
  await requireLibrarian();

  const { filter } = await props.searchParams;
  const active = typeof filter === "string" ? filter : "all";

  const supabase = await createClient();
  const { data: today } = await supabase.rpc("today_ist");

  let request = supabase
    .from("v_loans_with_fine")
    .select(
      "id, book_title, accession_number, member_name, member_roll_number, due_date, is_overdue, days_overdue, fine_outstanding, renewal_count",
    )
    .is("returned_at", null)
    .order("due_date")
    .limit(200);

  if (active === "overdue") request = request.eq("is_overdue", true);
  if (active === "due-today" && today) request = request.eq("due_date", today);

  const { data: loans } = await request;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={active === tab.key ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={`/loans?filter=${tab.key}`}>{tab.label}</Link>}
          />
        ))}
      </div>

      {!loans?.length ? (
        <Empty>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>
            {active === "overdue"
              ? "No book is overdue."
              : active === "due-today"
                ? "Nothing is due today."
                : "No books are currently on loan."}
          </EmptyDescription>
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
    </div>
  );
}
