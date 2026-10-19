import { CORS, authServer, jsonResponse } from "@/lib/mcp/oauth";

// Some MCP clients look for the authorization server's metadata on the resource origin.
// Mirror Supabase's (RFC 8414) so they find the same endpoints.
export const dynamic = "force-dynamic";

export async function GET() {
  const base = new URL(authServer());
  const res = await fetch(`${base.origin}/.well-known/oauth-authorization-server${base.pathname}`, { next: { revalidate: 3600 } });
  if (!res.ok) return jsonResponse({ error: "The sign-in server isn't enabled yet (Supabase → Authentication → OAuth Server)." }, 503);
  return jsonResponse(await res.json(), 200, { "Cache-Control": "public, max-age=3600" });
}
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
