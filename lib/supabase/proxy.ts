import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/mcp and /.well-known use bearer tokens, not the session cookie.
const PUBLIC_PATHS = ["/login", "/auth", "/api/mcp", "/.well-known"];
export const NEXT_COOKIE = "rb_next";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value as string),
          );
        },
      },
    },
  );

  // Keep getClaims() directly after creating the client (refreshes the session).
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    // Come back here after signing in (OAuth consent, invitations, deep links)
    if (next !== "/" && next.startsWith("/")) {
      res.cookies.set(NEXT_COOKIE, next, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 30, path: "/" });
    }
    return res;
  }

  return supabaseResponse;
}
