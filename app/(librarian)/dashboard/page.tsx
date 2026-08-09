import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard · Jeppiaar Educity Library" };

export default async function DashboardPage() {
  const user = await requireLibrarian();
  const supabase = await createClient();

  const [{ count: bookCount }, { count: copyCount }, { count: memberCount }] =
    await Promise.all([
      supabase.from("books").select("*", { count: "exact", head: true }),
      supabase.from("book_copies").select("*", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "member")
        .eq("account_status", "active"),
    ]);

  const stats = [
    { label: "Titles", value: bookCount ?? 0 },
    { label: "Copies", value: copyCount ?? 0 },
    { label: "Active members", value: memberCount ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.fullName}
        </h1>
        <p className="text-muted-foreground text-sm">
          Signed in as librarian.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next up</CardTitle>
          <CardDescription>
            The counter, catalogue and member screens are not built yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Auth is working: this page is reachable only by an active librarian,
          verified against the database on every request.
        </CardContent>
      </Card>
    </div>
  );
}
