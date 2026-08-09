"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";

import { requireLibrarian } from "@/lib/dal";
import { rpcErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionState } from "@/lib/types";

export async function collectFine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const fineId = String(formData.get("fineId") ?? "");
  if (!z.uuid().safeParse(fineId).success) return failure("That fine no longer exists.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("pay_fine", {
      p_fine_id: fineId,
      p_note: String(formData.get("note") ?? "") || undefined,
    })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not record that payment."));

  refresh();
  revalidatePath("/fines");
  return success(
    undefined,
    `Collected ₹${Number(data.amount_paid ?? 0).toFixed(2)} from ${data.member_name}.`,
  );
}

export async function waiveFine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireLibrarian();

  const parsed = z
    .object({
      fineId: z.uuid(),
      reason: z.string().trim().min(1, "A reason is required.").max(500),
    })
    .safeParse({
      fineId: formData.get("fineId"),
      reason: formData.get("reason"),
    });

  if (!parsed.success) {
    return failure("A reason is required to waive a fine.", {
      reason: ["Please say why."],
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("waive_fine", {
      p_fine_id: parsed.data.fineId,
      p_reason: parsed.data.reason,
    })
    .single();

  if (error) return failure(rpcErrorMessage(error, "Could not waive that fine."));

  refresh();
  revalidatePath("/fines");
  return success(
    undefined,
    `Waived ₹${Number(data.amount_waived ?? 0).toFixed(2)} for ${data.member_name}.`,
  );
}
