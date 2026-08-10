import { BackLink } from "@/components/back-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireLibrarian } from "@/lib/dal";

import { ImportForm, TemplateLink } from "./import-form";

export const metadata = { title: "Import members" };

export default async function ImportMembersPage() {
  await requireLibrarian();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackLink href="/members" label="Members" />
        <h2 className="text-xl font-semibold tracking-tight">Import members</h2>
        <p className="text-muted-foreground max-w-prose text-sm text-balance">
          Create many accounts at once from a spreadsheet. Export it as CSV
          first — in Excel or Google Sheets, File → Save as → CSV.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The file</CardTitle>
          <CardDescription>
            One member per row. The template has the exact column names and a
            few filled-in examples, including a faculty member and rows with
            optional fields left blank.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <TemplateLink />
          <ImportForm />
        </CardContent>
      </Card>
    </div>
  );
}
