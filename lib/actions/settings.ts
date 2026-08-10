"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";

const schema = z.object({
  loanPeriodDays: z.coerce.number().int().min(1).max(365),
  loanPeriodDaysStaff: z.coerce.number().int().min(1).max(365),
  finePerDay: z.coerce.number().min(0).max(10000),
  maxRenewals: z.coerce.number().int().min(0).max(20),
  maxBooksStudent: z.coerce.number().int().min(0).max(100),
  maxBooksStaff: z.coerce.number().int().min(0).max(100),
  publicRegistration: z.boolean(),
  libraryName: z.string().trim().min(1).max(200),
});

export async function updateSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireLibrarian();

  const parsed = schema.safeParse({
    loanPeriodDays: formData.get("loanPeriodDays"),
    loanPeriodDaysStaff: formData.get("loanPeriodDaysStaff"),
    finePerDay: formData.get("finePerDay"),
    maxRenewals: formData.get("maxRenewals"),
    maxBooksStudent: formData.get("maxBooksStudent"),
    maxBooksStaff: formData.get("maxBooksStaff"),
    publicRegistration: formData.get("publicRegistration") === "on",
    libraryName: formData.get("libraryName"),
  });

  if (!parsed.success) {
    return failure("Check the values below.", z.flattenError(parsed.error).fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      loan_period_days: parsed.data.loanPeriodDays,
      loan_period_days_staff: parsed.data.loanPeriodDaysStaff,
      fine_per_day: parsed.data.finePerDay,
      max_renewals: parsed.data.maxRenewals,
      max_books_student: parsed.data.maxBooksStudent,
      max_books_staff: parsed.data.maxBooksStaff,
      public_registration: parsed.data.publicRegistration,
      library_name: parsed.data.libraryName,
      updated_by: user.id,
    })
    .eq("id", 1);

  if (error) return failure(rpcErrorMessage(error, "Could not save those settings."));

  refresh();
  return success(undefined, "Settings saved. Existing loans keep their original terms.");
}
