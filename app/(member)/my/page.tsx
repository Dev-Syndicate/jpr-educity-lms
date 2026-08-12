import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { requireApprovedMember } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { formatIstDate } from "@/lib/utils";

export const metadata = { title: "My books" };

export default async function MyBooksPage() {
  const user = await requireApprovedMember();
  const supabase = await createClient();

  // RLS restricts this to the member's own rows, so no filter is needed for
  // correctness — but being explicit documents the intent.
  const { data: loans } = await supabase
    .from("v_loans_with_fine")
    .select(
      "id, book_title, book_author, issued_at, due_date, days_overdue, is_overdue, fine_outstanding",
    )
    .eq("member_id", user.id)
    .is("returned_at", null)
    .order("due_date");

  const owed = (loans ?? []).reduce(
    (sum, loan) => sum + Number(loan.fine_outstanding ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground text-sm">
          {user.rollNumber ? `${user.rollNumber} · ` : ""}
          {user.memberType === "staff" ? "Faculty" : "Student"}
        </p>
      </div>

      {owed > 0 ? (
        <Card className="border-overdue">
          <CardHeader>
            <CardDescription>Total due</CardDescription>
            <CardTitle className="text-overdue text-3xl tabular-nums">
              ₹{owed.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Please pay at the library counter.
          </CardContent>
        </Card>
      ) : null}

      {!loans?.length ? (
        <Empty>
          <EmptyTitle>No books issued</EmptyTitle>
          <EmptyDescription>
            Books you borrow will appear here with their due dates.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {loans.map((loan) => (
            <Card key={loan.id}>
              <CardHeader>
                <CardTitle className="text-base">{loan.book_title}</CardTitle>
                <CardDescription>{loan.book_author}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                {/* Issued before due: it is the earlier date, and it is what
                    tells the member how long they have already had the book. */}
                <span className="text-muted-foreground">
                  Issued{" "}
                  <span className="text-foreground font-medium">
                    {formatIstDate(loan.issued_at) ?? "—"}
                  </span>
                </span>
                <span>
                  Due <span className="font-medium">{loan.due_date}</span>
                </span>
                {loan.is_overdue ? (
                  <span className="text-overdue font-medium">
                    {loan.days_overdue} day(s) overdue · ₹
                    {Number(loan.fine_outstanding ?? 0).toFixed(2)}
                  </span>
                ) : (
                  <span className="text-available font-medium">On time</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
