import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The placeholder every list route shows while its data is in flight.
 *
 * These pages all share one shape — a toolbar, then a paginated table — so
 * they share one skeleton rather than each hand-rolling the same rows. What
 * varies is the column count and whether the toolbar carries a trailing
 * action button, and those are props.
 *
 * The point is not fidelity to the final pixel. It is that the click paints
 * something immediately: without a loading boundary Next cannot stream, so
 * the browser sits on the previous page for the whole server render and the
 * navigation feels broken.
 */
export function ListSkeleton({
  columns = 4,
  rows = 8,
  action = false,
  toolbar = true,
}: {
  columns?: number;
  rows?: number;
  /** Reserve space for a trailing button, e.g. "Add book". */
  action?: boolean;
  toolbar?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-full max-w-sm" />
          {action ? <Skeleton className="ml-auto h-9 w-28" /> : null}
        </div>
      ) : null}

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  {/* The last column is right-aligned in every one of these
                      tables, so its placeholder is too — otherwise the
                      skeleton visibly jumps when the real row lands. */}
                  <Skeleton
                    className={
                      i === columns - 1 ? "ml-auto h-4 w-16" : "h-4 w-24"
                    }
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, r) => (
              <TableRow key={r}>
                {Array.from({ length: columns }).map((_, c) => (
                  <TableCell key={c}>
                    <Skeleton
                      className={
                        c === columns - 1 ? "ml-auto h-5 w-16" : "h-5 w-32"
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
