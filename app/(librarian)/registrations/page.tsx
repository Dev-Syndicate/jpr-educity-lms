import Link from "next/link";

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
import type { MemberType } from "@/lib/types";

import { RegistrationActions } from "./registration-actions";

export const metadata = { title: "Registrations · Jeppiaar Educity Library" };

export default async function RegistrationsPage(props: PageProps<"/registrations">) {
  await requireLibrarian();

  const { status } = await props.searchParams;
  const filter = status === "rejected" ? "rejected" : "pending";

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, roll_number, department, declared_member_type, created_at, rejection_reason",
    )
    .eq("role", "member")
    .eq("account_status", filter)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {["pending", "rejected"].map((key) => (
          <Button
            key={key}
            variant={filter === key ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/registrations?status=${key}`} className="capitalize">
                {key}
              </Link>
            }
          />
        ))}
      </div>

      <p className="text-muted-foreground text-sm text-balance">
        {filter === "pending"
          ? "Registrations are normally approved at the counter, when the person first comes to borrow and can show a college ID. Nothing here needs doing."
          : "Rejected applications are kept so the same email cannot quietly re-register."}
      </p>

      {!rows?.length ? (
        <Empty>
          <EmptyTitle>Nothing {filter}</EmptyTitle>
          <EmptyDescription>
            {filter === "pending"
              ? "No one is waiting for approval."
              : "No applications have been rejected."}
          </EmptyDescription>
        </Empty>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Roll no.</TableHead>
                <TableHead>Claimed</TableHead>
                {filter === "pending" ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : (
                  <TableHead>Reason</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.full_name}</div>
                    <div className="text-muted-foreground text-xs">{row.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.roll_number ?? "—"}
                    {row.department ? (
                      <div className="text-muted-foreground font-sans text-xs">
                        {row.department}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-pending-subtle text-pending">
                      {row.declared_member_type === "staff" ? "Faculty" : "Student"}
                    </Badge>
                  </TableCell>
                  {filter === "pending" ? (
                    <TableCell className="text-right">
                      <RegistrationActions
                        memberId={row.id}
                        declaredType={row.declared_member_type as MemberType | null}
                      />
                    </TableCell>
                  ) : (
                    <TableCell className="text-muted-foreground text-sm">
                      {row.rejection_reason ?? "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
