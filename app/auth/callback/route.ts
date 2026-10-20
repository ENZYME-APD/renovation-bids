import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NEXT_COOKIE } from "@/lib/supabase/proxy";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const next = request.cookies.get(NEXT_COOKIE)?.value;
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      const res = NextResponse.redirect(`${origin}${target}`);
      res.cookies.delete(NEXT_COOKIE);
      return res;
    }
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }
  const desc = searchParams.get("error_description") ?? "The sign-in link is invalid or has expired.";
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(desc)}`);
}
