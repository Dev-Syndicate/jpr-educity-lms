"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { MATERIAL_CATEGORIES, MATERIAL_CATEGORY_PLURALS } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * "All / Books / Projects / …" across the top of a catalogue listing.
 *
 * Links rather than a Select or a client-side filter: the category belongs in
 * the URL alongside ?q=, so a filtered view is shareable and the back button
 * steps through filters the way a reader expects. It also means the filtering
 * happens in Postgres over the whole catalogue, not over the fifty rows that
 * happened to be fetched.
 *
 * Every link carries the current search term through — dropping ?q= here would
 * silently widen a search the moment someone narrowed it by category, which
 * reads as the filter having cleared their query.
 */
export function CategoryFilter({ active }: { active: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function href(category: string | null) {
    const next = new URLSearchParams(params.toString());
    if (category) next.set("category", category);
    else next.delete("category");
    // A filter change lands the reader on page 1; keeping ?page= would show
    // "no results" for a filter that has plenty on its first page.
    next.delete("page");

    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const options: { value: string | null; label: string }[] = [
    { value: null, label: "All" },
    // Plural: these label a group of titles, not one item. "Book" as a tab
    // beside "All" reads as a single record.
    ...MATERIAL_CATEGORIES.map((category) => ({
      value: category as string,
      label: MATERIAL_CATEGORY_PLURALS[category],
    })),
  ];

  return (
    // Scrolls rather than wrapping: six categories wrap to two ragged rows on
    // a phone, which pushes the table down and reads as a broken toolbar.
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      role="group"
      aria-label="Filter by category"
    >
      {options.map((option) => {
        const isActive = option.value === active;

        return (
          <Link
            key={option.value ?? "all"}
            href={href(option.value)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
          >
            <Badge
              className={cn(
                "cursor-pointer whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
