"use client";

import { ScanBarcodeIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Props = {
  pending: boolean;
  /** Changes identity on every settled action — drives clear and refocus. */
  nonce?: number;
  onScan: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Exposes the field so a caller can return focus to it — the counter's
   * confirmation dialog opens from a scan and so has no trigger of its own to
   * restore focus to.
   */
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

/**
 * The barcode field.
 *
 * A USB scanner behaves as a keyboard: it types the code then presses Enter.
 * Everything here exists to keep that loop tight for someone working a queue
 * at roughly one book per second who never looks at the mouse.
 */
export function ScanInput({
  pending,
  nonce,
  onScan,
  placeholder,
  disabled,
  inputRef,
}: Props) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const lastScan = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  // Clear and refocus after every settled action, so the next scan lands in an
  // empty field. Keyed on nonce as well as pending: two identical failures in
  // a row produce equal state, and without nonce this effect would not re-run.
  useEffect(() => {
    if (pending || disabled) return;
    const el = ref.current;
    if (!el) return;

    el.value = "";

    // Only reclaim focus from nothing. The counter's confirmation dialog is
    // open across exactly this transition — a scan settles its lookup while
    // the dialog holds focus — and focusing here would rip focus out of it and
    // put the librarian's Enter back in this field instead of on the Issue
    // button.
    const active = document.activeElement;
    if (!active || active === document.body || active === el) el.focus();
  }, [pending, nonce, disabled, ref]);

  // Keep focus. If the librarian clicks dead space, the next keystroke brings
  // focus back here rather than vanishing.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const active = document.activeElement;
      const isTypingElsewhere =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active as HTMLElement | null)?.isContentEditable === true;

      // Only steal focus from nothing — never from another field or a dialog.
      if (!isTypingElsewhere && (!active || active === document.body)) {
        ref.current?.focus();
      }
    }

    function onWindowFocus() {
      // Same rule as above: coming back to the tab must not pull focus out of
      // an open dialog.
      const active = document.activeElement;
      if (!active || active === document.body) ref.current?.focus();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [ref]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const el = ref.current;
        if (!el) return;

        // Scanners can append stray whitespace or a carriage return.
        const value = el.value.trim().toUpperCase();
        if (!value) return;

        // Double-fire guard. Scanners re-send, and librarians swipe twice; the
        // same code within 1.2s is almost never a genuine second copy.
        const now = Date.now();
        if (value === lastScan.current.value && now - lastScan.current.at < 1200) {
          el.value = "";
          return;
        }
        lastScan.current = { value, at: now };

        el.value = "";
        onScan(value);
      }}
    >
      <div className="relative">
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
          {pending ? <Spinner className="size-4" /> : <ScanBarcodeIcon className="size-4" />}
        </span>
        <Input
          ref={ref}
          name="accessionNumber"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          // readOnly rather than disabled while in flight: disabled blurs the
          // field, so the next scan would be typed into nothing.
          readOnly={pending}
          disabled={disabled}
          aria-busy={pending}
          aria-label="Scan or type an accession number"
          placeholder={placeholder ?? "Scan a book barcode…"}
          // Monospaced and centred so a barcode reads back at a glance, but
          // otherwise the same size as any other field in the app.
          className="h-11 pl-10 text-center font-mono tracking-wider"
        />
      </div>
    </form>
  );
}
