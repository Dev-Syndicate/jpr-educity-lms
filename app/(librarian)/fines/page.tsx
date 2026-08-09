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
import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { FineActions } from "./fine-actions";

export const metadata = { title: "Fines · Jeppiaar Educity Library" };

export default async function FinesPage() {
  await requireLibrarian();

  const supabase = await createClient();
  const { data: fines } = await supabase
    .from("fines")
    .select(
      "id, amount, assessed_at, member_id, loan_id, profiles!fines_member_id_fkey(full_name, roll_number), loans(book_id, books(title))",
    )
    .eq("is_paid", false)
    .eq("is_waived", false)
    .not("assessed_at", "is", null)
    .order("assessed_at", { ascending: false })
    .limit(100);

  const total = (fines ?? []).reduce((sum, f) => sum + Number(f.amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {!fines?.length ? (
        <Empty>
          <EmptyTitle>No outstanding fines</EmptyTitle>
          <EmptyDescription>
            Fines appear here once a book is returned late or an overdue book is
            brought to the counter.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {fines.length} unpaid ·{" "}
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
        </>
      )}
    </div>
  );
}
