/**
 * Parse the accession numbers a librarian typed.
 *
 * One per line or comma-separated, since a list is usually copied from a
 * register or typed while reading a stack of books. Uppercased and trimmed so
 * "jpr-1 " and "JPR-1" cannot become two different copies.
 */
export function parseAccessionNumbers(raw: string): {
  numbers?: string[];
  error?: string;
} {
  const numbers = raw
    .split(/[\n,]/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (!numbers.length) return { error: "Enter at least one accession number." };
  if (numbers.length > 200) return { error: "Add at most 200 copies at a time." };

  const tooLong = numbers.find((value) => value.length > 50);
  if (tooLong) return { error: `"${tooLong}" is too long for an accession number.` };

  // A repeat within one submission would otherwise surface as a clash with a
  // row that does not exist yet.
  const seen = new Set<string>();
  for (const value of numbers) {
    if (seen.has(value)) return { error: `${value} is listed twice.` };
    seen.add(value);
  }

  return { numbers };
}
