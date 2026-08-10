/**
 * A copy's physical location, as three parts of the rack label.
 *
 * Every part is optional: a copy can be catalogued before it is shelved, and
 * a librarian may know the row but not yet the section.
 */
export type ShelfLocation = {
  rowNo?: string | null;
  rackNo?: string | null;
  section?: string | null;
};

/**
 * Render a location the way the rack labels read: "Row 09 · Rack 01 · Sec A".
 *
 * Only the parts that are set appear, so a half-known location still says
 * something useful instead of "Row 09 · Rack — · Sec —". Returns null when
 * nothing is known, which callers show as an em dash or an "unshelved" hint —
 * an empty string would render as a confusing blank cell.
 *
 * Kept here rather than in a component because the detail page, the copies
 * table and the counter's search results all have to agree; three separate
 * template literals would drift the first time the format changed.
 */
export function formatShelfLocation(location: ShelfLocation): string | null {
  const parts: string[] = [];

  const row = location.rowNo?.trim();
  const rack = location.rackNo?.trim();
  const section = location.section?.trim();

  if (row) parts.push(`Row ${row}`);
  if (rack) parts.push(`Rack ${rack}`);
  if (section) parts.push(`Sec ${section}`);

  return parts.length ? parts.join(" · ") : null;
}

/** True when a copy has no location recorded at all. */
export function isUnshelved(location: ShelfLocation): boolean {
  return formatShelfLocation(location) === null;
}
