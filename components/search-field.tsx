"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Debounced search that writes to the URL, so results are shareable and the
 * back button works. Kept in the change handler rather than an effect — the
 * search is a response to typing, not a sync with external state.
 */
export function SearchField({
  placeholder = "Search…",
  paramName = "q",
}: {
  placeholder?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [value, setValue] = useState(params.get(paramName) ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      const search = new URLSearchParams(params.toString());
      if (next.trim()) search.set(paramName, next.trim());
      else search.delete(paramName);
      search.delete("page");

      startTransition(() => {
        router.replace(`${pathname}?${search}`, { scroll: false });
      });
    }, 250);
  }

  return (
    <div className="relative max-w-sm flex-1">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9"
        aria-label={placeholder}
      />
      {pending ? (
        <Spinner className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2" />
      ) : null}
    </div>
  );
}
