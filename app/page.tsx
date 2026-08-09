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
      <header className="bg-brand-deep text-brand-deep-foreground flex flex-col gap-2 rounded-xl p-6">
        <p className="text-gold text-sm font-medium tracking-widest uppercase">
          Jeppiaar Educity
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Library Management System
        </h1>
        <p className="max-w-prose text-sm opacity-90">
          Crest colours — forest green with gold. Every colour resolves from a
          token in app/globals.css.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Circulation states</CardTitle>
          <CardDescription>
            Status tokens, kept distinct from the brand green and gold.
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
