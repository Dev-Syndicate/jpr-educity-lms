"use client";

import { XCircleIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { useActionToast } from "@/components/use-action-toast";
import { idleState, type ActionState } from "@/lib/types";

/** Stable reference, so suppressing a toast never re-fires the effect. */
const IDLE = idleState;

/**
 * Result of the last scan.
 *
 * Successes go to a toast — it confirms and gets out of the way, which suits
 * a librarian working a queue who is already reaching for the next book.
 *
 * Failures stay INLINE, under the scan field, and do not time out. A failure
 * names a rule that has to be acted on ("collect ₹10 before renewing"), and
 * the librarian is usually looking at the book rather than the screen when it
 * lands — a message that floats in a corner on a timer is exactly the one
 * that gets missed.
 */
export function ScanFeedback({ state }: { state: ActionState<unknown> }) {
  const settled = Boolean(state.message);
  const ok = state.ok;

  // Successes only. A failure would otherwise be announced twice — once in
  // the banner below, once in a corner.
  useActionToast(ok ? state : IDLE);

  // A short beep. Librarians listen more than they read once they are in
  // rhythm, and the two tones are distinguishable without looking up.
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!settled) return;

    try {
      audioRef.current ??= new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Rising tone for success, low buzz for failure.
      osc.frequency.value = ok ? 880 : 220;
      osc.type = ok ? "sine" : "square";
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Audio is a nicety. A blocked AudioContext must never break a scan.
    }
    // state.nonce changes on every settled action, so repeated identical
    // failures still re-fire the beep.
  }, [settled, ok, state.nonce]);

  // A success has gone to the toast, so the field returns to its resting
  // prompt rather than holding a banner that repeats what the toast just said.
  if (!settled || ok) {
    return (
      <div className="text-muted-foreground flex min-h-11 items-center justify-center rounded-lg border border-dashed text-sm">
        Scan a book to begin.
      </div>
    );
  }

  return (
    <div
      key={state.nonce}
      role="status"
      aria-live="assertive"
      className="bg-overdue-subtle text-overdue flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm"
    >
      <XCircleIcon className="size-4 shrink-0" />
      <p className="leading-snug font-medium text-balance">{state.message}</p>
    </div>
  );
}
