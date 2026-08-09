import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">
          Jeppiaar Educity
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Library Management System
        </h1>
        <p className="text-muted-foreground max-w-prose">
          Setup complete. Every colour below resolves from a token in{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm">
            app/globals.css
          </code>
          , so editing that file restyles the whole application.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Circulation states</CardTitle>
          <CardDescription>
            Domain tokens used by badges, due dates and the counter banner.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge className="bg-available-subtle text-available">Available</Badge>
          <Badge className="bg-issued-subtle text-issued">Issued</Badge>
          <Badge className="bg-overdue-subtle text-overdue">Overdue · ₹5</Badge>
          <Badge className="bg-pending-subtle text-pending">Pending approval</Badge>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button>Issue book</Button>
          <Button variant="secondary">Renew</Button>
          <Button variant="outline">Return</Button>
          <Button variant="destructive">Reject</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
