import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/**
 * Page numbers to render, with gaps collapsed.
 *
 * Always shows first and last so the ends of a long list stay one click away,
 * plus a window around the current page. `null` marks an elided run.
 */
function pageWindow(current: number, last: number): (number | null)[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

  const pages = new Set<number>([1, last, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < last) pages.add(current + 1);
  // Keep the row a stable width near the ends, where the window is clipped.
  if (current <= 3) [2, 3, 4].forEach((n) => pages.add(n));
  if (current >= last - 2) [last - 3, last - 2, last - 1].forEach((n) => pages.add(n));

  const sorted = [...pages].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const n of sorted) {
    if (previous && n - previous > 1) out.push(null);
    out.push(n);
    previous = n;
  }
  return out;
}

/**
 * Pagination for a server-rendered list.
 *
 * Pages are links, not buttons, so a librarian can open one in a new tab and
 * the browser's back button behaves. `params` carries the rest of the query
 * string — losing the active search or filter when changing page is the
 * classic bug here.
 */
export function ListPagination({
  page,
  lastPage,
  total,
  basePath,
  params = {},
  label = "items",
}: {
  page: number;
  lastPage: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  if (lastPage <= 1) return null;

  const href = (n: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (n > 1) search.set("page", String(n));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm">
        Page {page} of {lastPage} · {total} {label}
      </p>

      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            {/* aria-disabled rather than omitted: the control keeps its place
                so the row does not shift as you move between pages. */}
            <PaginationPrevious
              href={page > 1 ? href(page - 1) : undefined}
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            />
          </PaginationItem>

          {pageWindow(page, lastPage).map((n, i) =>
            n === null ? (
              <PaginationItem key={`gap-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={n}>
                <PaginationLink href={href(n)} isActive={n === page}>
                  {n}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              href={page < lastPage ? href(page + 1) : undefined}
              aria-disabled={page >= lastPage}
              className={
                page >= lastPage ? "pointer-events-none opacity-50" : undefined
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
