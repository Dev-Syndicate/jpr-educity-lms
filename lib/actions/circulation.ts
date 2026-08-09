"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";

const accession = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^JPR-\d{5}$/, "Accession numbers look like JPR-00123.");

const uuid = z.uuid("Select a member first.");

export type IssueResult = {
  bookTitle: string;
  memberName: string;
  dueDate: string;
  loansOut: number;
  maxLoans: number;
};

export async function issueBook(
  _prev: ActionState<IssueResult>,
  formData: FormData,
): Promise<ActionState<IssueResult>> {
  // Re-authorise INSIDE the action: the layout check does not cover this, and
  // a proxy matcher change could silently stop covering this route's POST.
  await requireLibrarian();

  const parsed = z
    .object({ accessionNumber: accession, memberId: uuid })
    .safeParse({
      accessionNumber: formData.get("accessionNumber"),
      memberId: formData.get("memberId"),
    });

  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    return failure(
      errors.accessionNumber?.[0] ?? errors.memberId?.[0] ?? "Check the details.",
      errors,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("issue_book", {
      p_accession_number: parsed.data.accessionNumber,
      p_member_id: parsed.data.memberId,
    })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not issue this book."));

  refresh();

  return success(
    {
      bookTitle: data.book_title,
      memberName: data.member_name,
      dueDate: data.due_date,
      loansOut: data.loans_out,
      maxLoans: data.max_loans,
    },
    `Issued "${data.book_title}" to ${data.member_name}. Due ${data.due_date}.`,
  );
}

export type ReturnResult = {
  bookTitle: string;
  memberName: string;
  daysLate: number;
  fineAmount: number;
};

export async function returnBook(
  _prev: ActionState<ReturnResult>,
  formData: FormData,
): Promise<ActionState<ReturnResult>> {
  await requireLibrarian();

  const parsed = accession.safeParse(formData.get("accessionNumber"));
  if (!parsed.success) return failure(parsed.error.issues[0].message);

  const supabase = await createClient();

  // Find the open loan for this copy. RLS lets a librarian see every loan.
  const { data: loan, error: lookupError } = await supabase
    .from("v_loans_with_fine")
    .select("id, book_title, member_name")
    .eq("accession_number", parsed.data)
    .is("returned_at", null)
    .maybeSingle();

  if (lookupError) return failure(rpcErrorMessage(lookupError, "Could not look up that copy."));
  // View columns are nullable in the generated types — Postgres cannot prove
  // otherwise — so id needs a guard even though it is always present.
  if (!loan?.id) return failure(`${parsed.data} is not currently on loan.`);

  const { data, error } = await supabase
    .rpc("return_book", { p_loan_id: loan.id })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not return this book."));

  refresh();

  const fine = Number(data.fine_amount ?? 0);
  return success(
    {
      bookTitle: data.book_title,
      memberName: data.member_name,
      daysLate: data.days_late,
      fineAmount: fine,
    },
    fine > 0
      ? `Returned "${data.book_title}". ${data.days_late} day(s) late — collect ₹${fine.toFixed(2)}.`
      : `Returned "${data.book_title}". No fine.`,
  );
}

export type RenewResult = {
  bookTitle: string;
  memberName: string;
  dueDate: string;
  renewalCount: number;
  maxRenewals: number;
};

export async function renewLoan(
  _prev: ActionState<RenewResult>,
  formData: FormData,
): Promise<ActionState<RenewResult>> {
  await requireLibrarian();

  const raw = formData.get("loanId");
  const byLoanId = typeof raw === "string" && raw.length > 0;

  const supabase = await createClient();
  let loanId = byLoanId ? raw : null;

  if (!loanId) {
    const parsed = accession.safeParse(formData.get("accessionNumber"));
    if (!parsed.success) return failure(parsed.error.issues[0].message);

    const { data: loan } = await supabase
      .from("v_loans_with_fine")
      .select("id")
      .eq("accession_number", parsed.data)
      .is("returned_at", null)
      .maybeSingle();

    if (!loan?.id) return failure(`${parsed.data} is not currently on loan.`);
    loanId = loan.id;
  }

  // Assess any overdue fine FIRST, in its own transaction. renew_loan raises
  // to refuse an overdue renewal, and a raise rolls back everything in that
  // call — so a fine written inside it would vanish, leaving the librarian
  // told to collect money that no longer exists as a row.
  await supabase.rpc("assess_overdue_fine", { p_loan_id: loanId! });

  const { data, error } = await supabase
    .rpc("renew_loan", { p_loan_id: loanId! })
    .single();

  // The pay-before-renew rule surfaces here, with the amount owed.
  if (error) return failure(rpcErrorMessage(error, "Could not renew this book."));

  refresh();

  return success(
    {
      bookTitle: data.book_title,
      memberName: data.member_name,
      dueDate: data.due_date,
      renewalCount: data.renewal_count,
      maxRenewals: data.max_renewals,
    },
    `Renewed "${data.book_title}". Now due ${data.due_date}.`,
  );
}

/** Approve a pending member and issue in one transaction. */
export async function approveAndIssue(
  _prev: ActionState<IssueResult>,
  formData: FormData,
): Promise<ActionState<IssueResult>> {
  await requireLibrarian();

  const parsed = z
    .object({
      accessionNumber: accession,
      memberId: uuid,
      memberType: z.enum(["student", "staff"]).optional(),
    })
    .safeParse({
      accessionNumber: formData.get("accessionNumber"),
      memberId: formData.get("memberId"),
      memberType: formData.get("memberType") ?? undefined,
    });

  if (!parsed.success) {
    return failure("Check the details.", z.flattenError(parsed.error).fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("approve_and_issue", {
      p_profile_id: parsed.data.memberId,
      p_accession_number: parsed.data.accessionNumber,
      p_member_type: parsed.data.memberType ?? undefined,
    })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not approve and issue."));

  refresh();

  return success(
    {
      bookTitle: data.book_title,
      memberName: data.member_name,
      dueDate: data.due_date,
      loansOut: data.loans_out,
      maxLoans: data.max_loans,
    },
    `Approved ${data.member_name} and issued "${data.book_title}". Due ${data.due_date}.`,
  );
}
