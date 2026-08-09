import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

import { LibrarianForm } from "./librarian-form";
import { LibrarianStatusToggle } from "./librarian-status-toggle";

export const metadata = { title: "Librarians" };

export default async function StaffPage() {
  const me = await requireLibrarian();

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, is_active, created_at")
    .eq("role", "librarian")
    .order("is_active", { ascending: false })
    .order("full_name");

  const activeCount = rows?.filter((r) => r.is_active).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground max-w-prose text-sm text-balance">
          Librarians have full access: issuing, returning, waiving fines,
          editing the catalogue and changing the library rules. There is no
          lesser level of access.
        </p>
        <LibrarianForm />
      </div>

      {activeCount === 1 ? (
        <p className="text-muted-foreground text-sm text-balance">
          Only one active librarian. Add a second so a forgotten password is
          not a lockout.
        </p>
      ) : null}

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows?.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.full_name}</div>
                  <div className="text-muted-foreground text-xs">{row.email}</div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.phone ?? "—"}
                </TableCell>
                <TableCell>
                  {row.is_active ? (
                    <Badge className="bg-available-subtle text-available">Active</Badge>
                  ) : (
                    <Badge variant="outline">Deactivated</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <LibrarianStatusToggle
                    librarianId={row.id}
                    active={row.is_active}
                    isSelf={row.id === me.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
