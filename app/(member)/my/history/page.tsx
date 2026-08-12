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
import { formatIstDate } from "@/lib/utils";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const user = await requireApprovedMember();

  const supabase = await createClient();
  const { data: loans } = await supabase
    .from("v_loans_with_fine")
    .select("id, book_title, book_author, issued_at, returned_at, fine_amount")
    .eq("member_id", user.id)
    .not("returned_at", "is", null)
    .order("returned_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted-foreground text-sm">Books you have returned.</p>
      </div>

      {!loans?.length ? (
        <Empty>
          <EmptyTitle>No history yet</EmptyTitle>
          <EmptyDescription>Books you return will be listed here.</EmptyDescription>
        </Empty>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead className="hidden sm:table-cell">Issued</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead className="text-right">Fine paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell>
                    <div className="font-medium">{loan.book_title}</div>
                    <div className="text-muted-foreground text-xs">
                      {loan.book_author}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {formatIstDate(loan.issued_at) ?? "—"}
                  </TableCell>
                  {/* Formatted in IST rather than sliced off the ISO string:
                      a book returned after 18:30 IST is still "yesterday" in
                      UTC, so slicing showed the wrong day for evening returns. */}
                  <TableCell className="text-muted-foreground">
                    {formatIstDate(loan.returned_at) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(loan.fine_amount ?? 0) > 0
                      ? `₹${Number(loan.fine_amount).toFixed(2)}`
                      : "—"}
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
