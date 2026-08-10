import { PencilIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LoanActions } from "@/components/loan-actions";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyTitle } from "@/components/ui/empty";
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
import { initials } from "@/lib/utils";

import { MemberPasswordReset } from "./member-password-reset";
import { MemberStatusToggle } from "./member-status-toggle";

export default async function MemberDetailPage(props: PageProps<"/members/[id]">) {
  await requireLibrarian();
  const { id } = await props.params;

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, roll_number, department, phone, address, photo_path, member_type, account_status, is_active",
    )
    .eq("id", id)
    .maybeSingle();

  if (!member) notFound();

  // The bucket is private, so the image needs a signed URL. Short-lived by
  // design: the page is server-rendered on every visit, so a long expiry would
  // only widen the window in which a copied URL still works.
  const photoUrl = member.photo_path
    ? (
        await supabase.storage
          .from("member-photos")
          .createSignedUrl(member.photo_path, 60 * 10)
      ).data?.signedUrl ?? null
    : null;

  const [{ data: open }, { data: history }, { data: settings }] = await Promise.all([
    supabase
      .from("v_loans_with_fine")
      .select(
        "id, book_title, accession_number, due_date, is_overdue, days_overdue, fine_outstanding",
      )
      .eq("member_id", id)
      .is("returned_at", null)
      .order("due_date"),
    supabase
      .from("v_loans_with_fine")
      .select("id, book_title, accession_number, issued_at, returned_at, fine_amount")
      .eq("member_id", id)
      .not("returned_at", "is", null)
      .order("returned_at", { ascending: false })
      .limit(20),
    supabase
      .from("settings")
      .select("max_books_student, max_books_staff")
      .eq("id", 1)
      .single(),
  ]);

  const max =
    member.member_type === "staff"
      ? (settings?.max_books_staff ?? 5)
      : (settings?.max_books_student ?? 3);

  const owed = (open ?? []).reduce(
    (sum, loan) => sum + Number(loan.fine_outstanding ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        {/* Signed URL, so no next/image: the loader would need the host
            allow-listed and would cache a URL that expires in ten minutes. */}
        <Avatar className="size-16">
          {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
          <AvatarFallback>{initials(member.full_name)}</AvatarFallback>
        </Avatar>

        <div className="flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {member.full_name}
            {member.account_status === "pending" ? (
              <Badge className="bg-pending-subtle text-pending">Pending approval</Badge>
            ) : null}
            {member.account_status === "rejected" ? (
              <Badge className="bg-overdue-subtle text-overdue">Rejected</Badge>
            ) : null}
            {!member.is_active && member.account_status === "active" ? (
              <Badge variant="outline">Deactivated</Badge>
            ) : null}
          </h2>
          <p className="text-muted-foreground">
            {member.roll_number ?? "—"}
            {member.department ? ` · ${member.department}` : ""} ·{" "}
            {member.member_type === "staff" ? "Faculty" : "Student"} ·{" "}
            {open?.length ?? 0}/{max} books
            {owed > 0 ? ` · ₹${owed.toFixed(2)} due` : ""}
          </p>
          <p className="text-muted-foreground text-sm">
            {member.email}
            {member.phone ? ` · ${member.phone}` : ""}
          </p>
          {member.address ? (
            // whitespace-pre-line: the address is stored as typed, and a
            // three-line address must not collapse onto one.
            <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
              {member.address}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <MemberPasswordReset
            memberId={member.id}
            memberName={member.full_name}
          />
          <MemberStatusToggle memberId={member.id} active={member.is_active} />
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href={`/members/${member.id}/edit`}>
                <PencilIcon />
                Edit
              </Link>
            }
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Currently borrowed</CardTitle>
          <CardDescription>
            {open?.length ? `${open.length} book(s) out.` : "Nothing on loan."}
          </CardDescription>
        </CardHeader>
        {open?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell>
                    <div className="font-medium">{loan.book_title}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {loan.accession_number}
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
        ) : (
          <CardContent>
            <Empty className="py-6">
              <EmptyTitle>No books issued</EmptyTitle>
            </Empty>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Last 20 returned books.</CardDescription>
        </CardHeader>
        {history?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Book</TableHead>
                <TableHead>Returned</TableHead>
                <TableHead className="text-right">Fine</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell>
                    <div>{loan.book_title}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {loan.accession_number}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {loan.returned_at?.slice(0, 10) ?? "—"}
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
        ) : (
          <CardContent>
            <Empty className="py-6">
              <EmptyTitle>No history yet</EmptyTitle>
            </Empty>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
