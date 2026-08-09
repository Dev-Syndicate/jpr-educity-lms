import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * useSyncExternalStore rather than useState + useEffect: this reads an
 * external source (the media query), so it needs no state to fall out of sync,
 * and the server snapshot keeps hydration stable.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // Server render: assume desktop, matching the sidebar's default.
    () => false,
  );
}
