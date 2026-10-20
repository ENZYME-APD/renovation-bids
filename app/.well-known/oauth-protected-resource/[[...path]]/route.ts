import { CORS, jsonResponse, originOf, protectedResourceMetadata } from "@/lib/mcp/oauth";

// RFC 9728: tells MCP clients which server to sign in with. Served at the root and at the
// path-suffixed form (/.well-known/oauth-protected-resource/api/mcp) some clients try first.
export const dynamic = "force-dynamic";

export const GET = (req: Request) => jsonResponse(protectedResourceMetadata(originOf(req)), 200, { "Cache-Control": "public, max-age=3600" });
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
