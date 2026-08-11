/**
 * A copy's physical location, as three parts of the rack label.
 *
 * Every part is optional: a copy can be catalogued before it is shelved, and
 * a librarian may know the row but not yet the section.
 */
export type ShelfLocation = {
  /**
   * The Dewey call number, from `books.call_no` rather than the copy.
   *
   * It lives on the title (it classifies the work, not the shelf), but it is
   * accepted here because the rack label reads call number first and a
   * librarian walking to a shelf wants the whole address in one string.
   */
  callNo?: string | null;
  rowNo?: string | null;
  rackNo?: string | null;
  section?: string | null;
};

/**
 * Render a location the way the rack labels read:
 * "530 · Row 09 · Rack 01 · Sec A".
 *
 * The call number leads, because that is the order printed on the label —
 * CALL NO down the left, then the row, rack and section across.
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

  const callNo = location.callNo?.trim();
  const row = location.rowNo?.trim();
  const rack = location.rackNo?.trim();
  const section = location.section?.trim();

  // Bare, without a "Call" prefix: the number is self-evidently a call number
  // to anyone reading a rack label, and the label itself prints it bare.
  if (callNo) parts.push(callNo);
  if (row) parts.push(`Row ${row}`);
  if (rack) parts.push(`Rack ${rack}`);
  if (section) parts.push(`Sec ${section}`);

  return parts.length ? parts.join(" · ") : null;
}

/**
 * True when a copy has no PHYSICAL location recorded.
 *
 * Deliberately ignores callNo. A call number is a classification, not a
 * place — a title can be classified 530 and still be sitting in a crate, so
 * asking formatShelfLocation() would call that copy shelved and quietly stop
 * prompting anyone to shelve it.
 */
export function isUnshelved(location: ShelfLocation): boolean {
  return (
    formatShelfLocation({
      rowNo: location.rowNo,
      rackNo: location.rackNo,
      section: location.section,
    }) === null
  );
}
