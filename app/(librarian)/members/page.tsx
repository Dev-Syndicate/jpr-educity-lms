import { PlusIcon } from "lucide-react";
import Link from "next/link";

import { SearchField } from "@/components/search-field";
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

export const metadata = { title: "Members · Jeppiaar Educity Library" };

export default async function MembersPage(props: PageProps<"/members">) {
  await requireLibrarian();

  const { q, status } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const VALID = ["active", "pending", "rejected", "all"] as const;
  const filter = (VALID as readonly string[]).includes(String(status))
    ? (status as (typeof VALID)[number])
    : "active";

  const supabase = await createClient();
  let request = supabase
    .from("profiles")
    .select("id, full_name, roll_number, department, member_type, account_status, is_active")
    .eq("role", "member")
    .order("full_name")
    .limit(100);

  if (filter !== "all") request = request.eq("account_status", filter);
  if (query) {
    request = request.or(`full_name.ilike.%${query}%,roll_number.ilike.%${query}%`);
  }

  const { data: members } = await request;

  const dues = members?.length
    ? (
        await supabase
          .from("v_member_dues")
          .select("member_id, books_out, total_outstanding")
          .in("member_id", members.map((m) => m.id))
      ).data
    : [];

  const byId = new Map(dues?.map((d) => [d.member_id, d]) ?? []);

  const TABS = [
    { key: "active", label: "Active" },
    { key: "pending", label: "Pending" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search name or roll number" />
        <Button
          className="ml-auto"
          nativeButton={false}
          render={
            <Link href="/members/new">
              <PlusIcon />
              Add member
            </Link>
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={filter === tab.key ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`/members?${new URLSearchParams({ ...(query && { q: query }), status: tab.key })}`}
              >
                {tab.label}
              </Link>
            }
          />
        ))}
      </div>

      {!members?.length ? (
        <Empty>
          <EmptyTitle>No members</EmptyTitle>
          <EmptyDescription>
            {query ? `Nothing matches “${query}”.` : "Add a member to get started."}
          </EmptyDescription>
        </Empty>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roll no.</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Books</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const d = byId.get(member.id);
                const owed = Number(d?.total_outstanding ?? 0);
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Link
                        href={`/members/${member.id}`}
                        className="font-medium hover:underline"
                      >
                        {member.full_name}
                      </Link>
                      <div className="flex gap-1.5 pt-1">
                        {member.account_status === "pending" ? (
                          <Badge className="bg-pending-subtle text-pending">Pending</Badge>
                        ) : null}
                        {member.account_status === "rejected" ? (
                          <Badge className="bg-overdue-subtle text-overdue">Rejected</Badge>
                        ) : null}
                        {!member.is_active && member.account_status === "active" ? (
                          <Badge variant="outline">Inactive</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {member.roll_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.member_type === "staff" ? "Faculty" : "Student"}
                    </TableCell>
                    <TableCell className="tabular-nums">{d?.books_out ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {owed > 0 ? (
                        <span className="text-overdue font-medium">₹{owed.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
