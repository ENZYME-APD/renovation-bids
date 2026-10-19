import { getResponse, handleMcpPost, optionsResponse } from "@/lib/mcp/server";

// MCP endpoint (Streamable HTTP, stateless JSON). Sign-in is OAuth 2.1 via Supabase Auth.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (req: Request) => handleMcpPost(req);
export const GET = (req: Request) => getResponse(req);
export const OPTIONS = () => optionsResponse();
