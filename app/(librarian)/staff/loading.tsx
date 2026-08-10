import { ListSkeleton } from "@/components/list-skeleton";

export default function Loading() {
  // Staff has no search field — its toolbar is prose plus the add button.
  return <ListSkeleton columns={4} toolbar={false} rows={4} />;
}
