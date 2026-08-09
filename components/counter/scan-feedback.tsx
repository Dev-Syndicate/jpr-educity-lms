"use client";

import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ActionState } from "@/lib/types";

/**
 * Result of the last scan, sized to be read from a metre away.
 *
 * Deliberately not a toast or a dialog: a toast auto-dismisses and gets
 * missed, and a dialog costs a keystroke per book.
 */
export function ScanFeedback({ state }: { state: ActionState<unknown> }) {
  const settled = Boolean(state.message);
  const ok = state.ok;

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

  if (!settled) {
    return (
      <div className="text-muted-foreground flex min-h-24 items-center justify-center rounded-xl border border-dashed text-sm">
        Scan a book to begin.
      </div>
    );
  }

  return (
    <div
      key={state.nonce}
      role="status"
      aria-live="assertive"
      className={
        ok
          ? "bg-available-subtle text-available flex min-h-24 items-start gap-4 rounded-xl p-5"
          : "bg-overdue-subtle text-overdue flex min-h-24 items-start gap-4 rounded-xl p-5"
      }
    >
      {ok ? (
        <CheckCircle2Icon className="mt-0.5 size-8 shrink-0" />
      ) : (
        <XCircleIcon className="mt-0.5 size-8 shrink-0" />
      )}
      <p className="text-xl leading-snug font-semibold text-balance">
        {state.message}
      </p>
    </div>
  );
}
