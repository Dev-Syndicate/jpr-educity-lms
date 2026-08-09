import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The library's mark: the same artwork as app/icon.png, so the favicon in the
 * tab and the logo on the page are recognisably one thing.
 *
 * Served from public/logo.png rather than the app/icon.png metadata route:
 * Next fingerprints that route's URL per build, which is right for a <link
 * rel="icon"> it generates itself but not for a src we hardcode here.
 *
 * The tile already carries its own deep-green ground and rounded corners, so
 * it needs no wrapper — putting it on a `bg-primary` square would stack two
 * different greens.
 */
export function BrandMark({
  className,
  size = 32,
  variant = "tile",
}: {
  className?: string;
  size?: number;
  /**
   * "tile" carries its own deep-green ground — for light surfaces.
   *
   * "glyph" is the gold book alone on transparency, for a ground that is
   * already brand-deep. The tile there is the exact same green as the panel
   * behind it, so it would either vanish or, if the token later changed,
   * appear as an unintended square.
   */
  variant?: "tile" | "glyph";
}) {
  return (
    <Image
      src={variant === "glyph" ? "/logo-glyph.png" : "/logo.png"}
      alt=""
      width={size}
      height={size}
      // Decorative: every place this renders is next to the library's name in
      // text, so announcing it again would just repeat that to a screen reader.
      aria-hidden
      className={cn(variant === "tile" && "rounded-md", className)}
      priority
    />
  );
}
