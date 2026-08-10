import { Card, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The member's own loans — a stack of cards, not a table. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-40" />

      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-56" />
              <Skeleton className="mt-2 h-4 w-32" />
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
