import { PlusIcon, SearchXIcon, UploadIcon, UsersIcon } from "lucide-react";
import Link from "next/link";

import { ListPagination } from "@/components/list-pagination";
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
import type { MemberType } from "@/lib/types";

import { RegistrationActions } from "./registration-actions";

export const metadata = { title: "Members" };

const PAGE_SIZE = 25;

export default async function MembersPage(props: PageProps<"/members">) {
  await requireLibrarian();

  const { q, status, page } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const VALID = ["active", "pending", "rejected", "all"] as const;
  const filter = (VALID as readonly string[]).includes(String(status))
    ? (status as (typeof VALID)[number])
    : "active";
  const pageNo = Math.max(1, Number(page) || 1);
  const from = (pageNo - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let request = supabase
    .from("profiles")
    .select(
      "id, full_name, roll_number, department, member_type, declared_member_type, account_status, is_active, rejection_reason",
      { count: "exact" },
    )
    .eq("role", "member")
    .order("full_name")
    .range(from, from + PAGE_SIZE - 1);

  if (filter !== "all") request = request.eq("account_status", filter);
  if (query) {
    request = request.or(`full_name.ilike.%${query}%,roll_number.ilike.%${query}%`);
  }

  const { data: members, count } = await request;
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const dues = members?.length
    ? (
        await supabase
          .from("v_member_dues")
          .select("member_id, books_out, total_outstanding")
          .in("member_id", members.map((m) => m.id))
      ).data
    : [];

  const byId = new Map(dues?.map((d) => [d.member_id, d]) ?? []);

  // Counts are scoped to the search too. A tab reading "Pending 4" that lands
  // on an empty list because the search excludes all four would be a lie.
  const countFor = async (status: "active" | "pending" | "rejected") => {
    let counter = supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "member")
      .eq("account_status", status);
    if (query) {
      counter = counter.or(
        `full_name.ilike.%${query}%,roll_number.ilike.%${query}%`,
      );
    }
    return (await counter).count ?? 0;
  };

  const [activeCount, pendingCount, rejectedCount] = await Promise.all([
    countFor("active"),
    countFor("pending"),
    countFor("rejected"),
  ]);

  const TABS = [
    { key: "active", label: "Active", count: activeCount },
    { key: "pending", label: "Pending", count: pendingCount },
    { key: "rejected", label: "Rejected", count: rejectedCount },
    {
      key: "all",
      label: "All",
      count: activeCount + pendingCount + rejectedCount,
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Search name or roll number" />
        <Button
          className="ml-auto"
          variant="outline"
          nativeButton={false}
          render={
            <Link href="/members/import">
              <UploadIcon />
              Import
            </Link>
          }
        />
        <Button
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
                {/* Inherits the button's own foreground rather than nesting a
                    Badge, whose colours would fight the selected state. */}
                <span className="tabular-nums opacity-60">{tab.count}</span>
              </Link>
            }
          />
        ))}
      </div>

      {!members?.length ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12">
              {query ? (
                <SearchXIcon className="text-muted-foreground size-6" />
              ) : (
                <UsersIcon className="text-muted-foreground size-6" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {query
                ? "No matches"
                : filter === "pending"
                  ? "No one waiting"
                  : filter === "rejected"
                    ? "Nothing rejected"
                    : "No members yet"}
            </EmptyTitle>
            <EmptyDescription>
              {query
                ? `Nothing matches “${query}”.`
                : filter === "pending"
                  ? "Nobody has applied for an account. Applicants are normally approved at the counter."
                  : filter === "rejected"
                    ? "No application has been turned down."
                    : "Add a member to get started."}
            </EmptyDescription>
          </EmptyHeader>
          {/* Only where it is the right next move: "add a member" is not the
              answer to an empty pending or rejected list. */}
          {!query && (filter === "active" || filter === "all") ? (
            <EmptyContent>
              <Button
                nativeButton={false}
                render={
                  <Link href="/members/new">
                    <PlusIcon />
                    Add a member
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
                          <Badge
                            className="bg-overdue-subtle text-overdue"
                            title={member.rejection_reason ?? undefined}
                          >
                            Rejected
                          </Badge>
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
                      {(member.declared_member_type ?? member.member_type) === "staff"
                        ? "Faculty"
                        : "Student"}
                      {member.account_status === "pending" ? (
                        // Unverified until someone checks a college ID: a
                        // false "faculty" claim would grant 5 books, not 3.
                        <span className="block text-xs">claimed</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{d?.books_out ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* A pending applicant has no loans and owes nothing, so
                          the Due cell is free to carry the decision instead —
                          which is what the separate Registrations screen was
                          for. Checked per row, since the All tab mixes states. */}
                      {member.account_status === "pending" ? (
                        <RegistrationActions
                          memberId={member.id}
                          declaredType={
                            (member.declared_member_type ??
                              member.member_type) as MemberType | null
                          }
                        />
                      ) : owed > 0 ? (
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

      <ListPagination
        page={pageNo}
        lastPage={lastPage}
        total={total}
        basePath="/members"
        params={{ q: query, status: filter }}
        label="members"
      />
    </div>
  );
}
