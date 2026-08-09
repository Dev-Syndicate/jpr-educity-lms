import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 renamed `middleware` to `proxy`. This file MUST be named proxy.ts
 * and export a function named `proxy`.
 *
 * Do NOT add `export const runtime` here — proxy is always the Node.js runtime
 * and setting it throws at build time.
 *
 * Two jobs, in order of importance:
 *
 * 1. REFRESH THE SESSION. Server Components cannot set cookies, so this is the
 *    only place rotated auth tokens can be persisted on a page load. Without
 *    it, sessions silently expire mid-use.
 *
 * 2. An OPTIMISTIC role redirect, purely to avoid a flash of the wrong page.
 *    This is NOT a security boundary — lib/dal.ts and the database are. A
 *    matcher change here must never be able to grant access.
 */

const PUBLIC_PATHS = ["/login", "/register", "/auth"];

export async function proxy(request: NextRequest) {
  // The Supabase client writes refreshed cookies onto THIS object, so this
  // exact object must be the one returned.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update the request so the downstream render sees fresh tokens...
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          // ...rebuild the response around the mutated request...
          response = NextResponse.next({ request });
          // ...and write Set-Cookie onto what we return.
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // MUST be getUser(), not getSession(). getSession only decodes the JWT
  // locally without verifying it; getUser revalidates against the auth server
  // and triggers the token refresh this whole function exists for.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return copyCookies(response, NextResponse.redirect(url));
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return copyCookies(response, NextResponse.redirect(url));
  }

  return response;
}

/**
 * Carry refreshed auth cookies onto a redirect.
 *
 * Skipping this drops the rotated tokens, so the next request looks
 * unauthenticated and redirects again — an infinite loop.
 */
function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

export const config = {
  // Excluding static assets matters: without it, proxy runs on every CSS and
  // image request and can redirect them to /login.
  //
  // Note that Server Actions POST to the route they are used on, so narrowing
  // this also removes proxy coverage from those actions. The DAL re-check in
  // every action is what makes that safe.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
