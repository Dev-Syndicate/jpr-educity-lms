/**
 * A small RFC 4180 CSV reader.
 *
 * Hand-written rather than a dependency because the shape is fixed and known:
 * a header row plus data rows exported from Excel or Google Sheets. What it
 * does have to handle is quoting — an address is "12, Anna Nagar, Chennai",
 * and splitting that on commas silently shifts every later column.
 *
 * Handles: quoted fields, commas and newlines inside quotes, "" as an escaped
 * quote, a UTF-8 BOM (Excel writes one), and CRLF line endings.
 */

/** Split raw CSV text into rows of cells. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  // Excel prefixes a BOM; left in place it becomes part of the first header
  // name, so "full_name" would not match.
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        // "" inside a quoted field is a literal quote, not the end of it.
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // \r\n is one break, not two.
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      // A trailing newline would otherwise add a row of one empty cell.
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  // Whatever is left when the text ends without a final newline.
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  return rows;
}

/**
 * Parse into objects keyed by the header row.
 *
 * Header names are lowercased and their spaces and hyphens folded to
 * underscores, so "Full Name", "full name" and "full_name" are all accepted —
 * a librarian editing the template in Excel should not have to match its
 * casing exactly.
 */
export function parseCsvRows(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const raw = parseCsv(text);
  if (!raw.length) return { headers: [], rows: [] };

  const headers = raw[0].map((h) =>
    h.trim().toLowerCase().replace(/[\s-]+/g, "_"),
  );

  const rows = raw.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = (cells[i] ?? "").trim();
    });
    return record;
  });

  return { headers, rows };
}
