import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Matches the detail layout rather than reusing ListSkeleton, which is
 * table-shaped — a table placeholder resolving into a details card is a
 * visible jump, which is worse than a plain spinner.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-2/3 max-w-sm" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-6 w-32" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-20" />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
