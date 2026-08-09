import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

/**
 * A back link to a known parent page — deliberately a real Link rather than
 * router.back(), so it points somewhere sensible when the page is opened from
 * a pasted URL, a refresh, or a redirect, where there is no history to pop.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeftIcon className="size-4" />
      {label}
    </Link>
  );
}
