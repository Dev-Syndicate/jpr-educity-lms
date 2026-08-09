"use client";

import { useEffect, useRef } from "react";

import { toast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/types";

/**
 * Raise a toast whenever a Server Action settles.
 *
 * Every action returns the same ActionState, so this is the one place that
 * decides how a result is announced. Components keep passing their state
 * around as before; they just call this alongside.
 *
 * Keyed on `nonce`, which changes on every settled action — without it,
 * submitting the same failing form twice produces a deeply-equal state and
 * the second failure would pass unannounced.
 */
export function useActionToast(state: ActionState<unknown>) {
  const seen = useRef<number>(0);

  useEffect(() => {
    const nonce = state.nonce ?? 0;
    if (!nonce || nonce === seen.current || !state.message) return;
    seen.current = nonce;

    toast.add({
      title: state.message,
      type: state.ok ? "success" : "error",
      // Errors stay until dismissed (timeout 0). A message naming a rule the
      // librarian has to act on ("collect ₹10 before renewing") must not time
      // out while they are looking at the book rather than the screen.
      timeout: state.ok ? 4000 : 0,
      priority: state.ok ? "low" : "high",
    });
  }, [state.nonce, state.ok, state.message]);
}
