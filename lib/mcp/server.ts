import "server-only";
import { resolveToken } from "./context";
import { TOOLS, ToolError } from "./tools";

// A small, stateless MCP server over Streamable HTTP: each POST carries JSON-RPC messages and
// gets a plain JSON reply. No sessions or server-sent events.

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "renovation-bids", title: "Renovation Bids", version: "0.1.0" };
const ABOUT =
  "This platform manages a studio's interior renovation projects in Spain through their whole life, in phases: " +
  "bid (pre-contract, pre-design), design, construction and closed. Budgets are versions made of priced partidas " +
  "(a standard catalogue of work items with codes like DEM-040, grouped in chapters) and room templates. When a project is won " +
  "the signed contract freezes a copy of the budget as the baseline; after that, scope changes are change orders " +
  "(current budget = contract + approved change orders). There are also client requests, suppliers and requests for quotes, " +
  "purchase orders, supplier invoices and payments. Call get_overview first. Amounts are in the studio currency it returns, " +
  "before VAT unless stated. Rule of the studio: until a project is won, the bid has one generic version (no options or client variations), unless the studio allows options in the bid. " +
  "Quantities can come from any source (Archicad or other BIM, drawings, AI assumptions, or by hand): lines record their source, and lines edited by hand are marked overridden so syncs leave them alone.";
const READ_ONLY = " This connection is read-only.";
const CAN_WRITE =
  " This connection can also make changes. Before changing anything, tell the user exactly what you will change and wait for them to confirm. " +
  "Each change returns a change_id; undo_change reverts it.";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

type RpcId = string | number | null;
interface RpcMessage { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

export const resourceMetadataUrl = (req: Request) => `${new URL(req.url).origin}/.well-known/oauth-protected-resource`;

export function bearerFrom(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

export const optionsResponse = () => new Response(null, { status: 204, headers: CORS });

export function getResponse(req: Request) {
  return new Response(JSON.stringify({ name: "Renovation Bids MCP server", usage: "Add this address as a custom connector in your AI assistant. See Settings → AI access." }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(req)}"`, ...CORS },
  });
}

export async function handleMcpPost(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  const auth = await resolveToken(bearerFrom(req));
  if (!auth.ok) {
    const id = !Array.isArray(body) && body && typeof body === "object" ? ((body as RpcMessage).id ?? null) : null;
    const res = json(rpcError(id, -32001, auth.message), auth.status);
    if (auth.status === 401) res.headers.set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl(req)}"`);
    return res;
  }
  const ctx = auth.ctx;
  const tools = TOOLS.filter((t) => !t.writes || ctx.canWrite);

  const handle = async (msg: RpcMessage): Promise<unknown | null> => {
    const isRequest = msg && msg.id !== undefined && msg.id !== null;
    if (!msg || typeof msg.method !== "string") return isRequest ? rpcError(msg?.id ?? null, -32600, "Invalid request") : null;
    if (!isRequest) return null;
    const id = msg.id as RpcId;

    switch (msg.method) {
      case "initialize": {
        const asked = String(msg.params?.protocolVersion || "");
        return {
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: ABOUT + (ctx.canWrite ? CAN_WRITE : READ_ONLY),
          },
        };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return {
          jsonrpc: "2.0", id,
          result: {
            tools: tools.map((t) => ({
              name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
              annotations: { title: t.title, readOnlyHint: !t.writes, destructiveHint: !!t.destructive, idempotentHint: !t.writes, openWorldHint: false },
            })),
          },
        };
      case "tools/call": {
        const name = String(msg.params?.name || "");
        const tool = tools.find((t) => t.name === name);
        if (!tool) {
          const hidden = TOOLS.some((t) => t.name === name);
          return rpcError(id, -32602, hidden ? `${name} makes changes, and this connection is read-only for your role.` : `Unknown tool: ${name}`);
        }
        const args = (msg.params?.arguments && typeof msg.params.arguments === "object" ? msg.params.arguments : {}) as Record<string, unknown>;
        try {
          const result = await tool.run(args, ctx);
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false } };
        } catch (e) {
          const known = e instanceof ToolError;
          const message = known ? (e as Error).message : "Something went wrong in Renovation Bids. Check list_recent_changes before retrying a change.";
          if (!known) console.error("MCP tool error", name, e);
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], isError: true } };
        }
      }
      case "resources/list":
        return { jsonrpc: "2.0", id, result: { resources: [] } };
      case "prompts/list":
        return { jsonrpc: "2.0", id, result: { prompts: [] } };
      default:
        return rpcError(id, -32601, `Method not found: ${msg.method}`);
    }
  };

  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handle(m as RpcMessage)))).filter((r) => r !== null);
    return replies.length ? json(replies) : new Response(null, { status: 202, headers: CORS });
  }
  const reply = await handle(body as RpcMessage);
  return reply === null ? new Response(null, { status: 202, headers: CORS }) : json(reply);
}
