import { notFound } from "next/navigation";

import { requireLibrarian } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireLibrarian();

  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select(
      "loan_period_days, loan_period_days_staff, fine_per_day, max_renewals, max_books_student, max_books_staff, public_registration, library_name",
    )
    .eq("id", 1)
    .maybeSingle();

  if (!data) notFound();

  return <SettingsForm settings={data} />;
}
