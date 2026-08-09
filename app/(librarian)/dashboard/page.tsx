import Link from "next/link";

import { SectionCards, type Stat } from "@/components/section-cards";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard · Jeppiaar Educity Library" };

export default async function DashboardPage() {
  await requireLibrarian();
  const supabase = await createClient();

  const [copies, members, pending, openLoans, overdue] = await Promise.all([
    supabase.from("book_copies").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "member")
      .eq("account_status", "active"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("account_status", "pending"),
    supabase
      .from("loans")
      .select("*", { count: "exact", head: true })
      .is("returned_at", null),
    supabase
      .from("v_loans_with_fine")
      .select(
        "id, book_title, accession_number, member_name, member_roll_number, due_date, days_overdue, fine_outstanding",
      )
      .eq("is_overdue", true)
      .order("due_date")
      .limit(10),
  ]);

  const overdueRows = overdue.data ?? [];
  const owed = overdueRows.reduce(
    (sum, row) => sum + Number(row.fine_outstanding ?? 0),
    0,
  );

  const stats: Stat[] = [
    { label: "Books on loan", value: openLoans.count ?? 0 },
    {
      label: "Overdue",
      value: overdueRows.length,
      tone: overdueRows.length ? "overdue" : "default",
      hint: owed > 0 ? `₹${owed.toFixed(2)} outstanding` : undefined,
    },
    { label: "Active members", value: members.count ?? 0 },
    {
      label: "Pending registrations",
      value: pending.count ?? 0,
      tone: (pending.count ?? 0) > 0 ? "pending" : "default",
      hint: "Approved at the counter, or under Members",
    },
  ];

  return (
    <>
      <SectionCards stats={stats} />

      <Card>
        <CardHeader>
          <CardTitle>Overdue books</CardTitle>
          <CardDescription>
            {overdueRows.length
              ? "Oldest first. Fines accrue at ₹1 per day."
              : `${copies.count ?? 0} copies in the catalogue.`}
          </CardDescription>
          {overdueRows.length ? (
            <CardAction>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href="/loans">All loans</Link>}
              />
            </CardAction>
          ) : null}
        </CardHeader>

        {overdueRows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Fine</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdueRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.book_title}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {row.accession_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{row.member_name}</div>
                    <div className="text-muted-foreground text-xs">
                      {row.member_roll_number}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-overdue-subtle text-overdue">
                      {row.days_overdue}d late
                    </Badge>
                  </TableCell>
                  <TableCell className="text-overdue text-right font-medium tabular-nums">
                    ₹{Number(row.fine_outstanding ?? 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyTitle>Nothing overdue</EmptyTitle>
            <EmptyDescription>
              Every book on loan is within its due date.
            </EmptyDescription>
          </Empty>
        )}
      </Card>
    </>
  );
}
