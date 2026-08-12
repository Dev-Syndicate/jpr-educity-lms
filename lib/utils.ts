import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A loan timestamp as the IST calendar date it happened on, "YYYY-MM-DD".
 *
 * `loans.issued_at` is a timestamptz; `due_date` is a plain date already in
 * IST. Rendering the timestamp raw would put a full ISO string with a UTC
 * offset next to a bare date, and — worse — a book issued after 18:30 IST
 * would display the PREVIOUS day, because that instant is still yesterday in
 * UTC. Formatting in Asia/Kolkata is what makes the two dates comparable.
 *
 * en-CA gives ISO-ordered output (2026-08-12), matching how every other date
 * in this app is written.
 *
 * Returns null for null input so callers can omit the row rather than print
 * "Invalid Date".
 */
export function formatIstDate(value: string | null | undefined) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

/**
 * Up to two initials for an avatar fallback, e.g. "Asha Rao" -> "AR".
 *
 * Shared so the sidebar account row and the member detail page cannot render
 * the same person differently.
 */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}
