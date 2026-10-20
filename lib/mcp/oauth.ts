// OAuth discovery for MCP clients. Supabase Auth is the authorization server; this app is the
// protected resource (RFC 9728) and mirrors Supabase's server metadata for clients that look
// for it on the resource's own origin.

export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Mcp-Protocol-Version" };

export const authServer = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/auth/v1`;

export function originOf(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const protectedResourceMetadata = (origin: string) => ({
  resource: `${origin}/api/mcp`,
  authorization_servers: [authServer()],
  bearer_methods_supported: ["header"],
  scopes_supported: ["openid", "email", "profile"],
  resource_name: "Renovation Bids",
  resource_documentation: `${origin}/settings?tab=ai`,
});

export const jsonResponse = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
