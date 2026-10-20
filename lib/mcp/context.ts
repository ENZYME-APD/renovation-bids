import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["member_role"];

export interface McpContext {
  userId: string;
  email: string;
  clientId: string | null;
  studio: { id: string; name: string; regionId: string; currency: string; language: string; contingencyPct: number; vatPct: number };
  role: Role;
  canWrite: boolean;
  /** Client for reads (one per request). */
  db: Db;
  /** A new client whose requests are logged as one change; returns it with its change id. */
  change: () => { db: Db; changeId: string };
}

export type ResolveResult = { ok: true; ctx: McpContext } | { ok: false; status: number; message: string };

function client(token: string, extra: Record<string, string> = {}): Db {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}`, "x-client-source": "mcp", ...extra } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const mayConnect = (role: Role, rule: string) =>
  rule === "everyone" || (rule === "members" && role !== "viewer") || (rule === "admins" && (role === "owner" || role === "admin"));
const mayChange = (role: Role, rule: string) => role === "owner" || role === "admin" || (rule === "members" && role === "member");

/**
 * Validates the bearer token (a Supabase access token, normally issued by the Supabase OAuth
 * server to the assistant) and loads the caller's studio. Everything afterwards runs as that
 * user, so row-level security and the studio's AI rules apply in the database too.
 */
export async function resolveToken(token: string | null): Promise<ResolveResult> {
  if (!token) return { ok: false, status: 401, message: "Sign in to connect: this server needs an access token." };
  const db = client(token, { "x-change-id": `mcp-read:${crypto.randomUUID()}` });
  const { data, error } = await db.auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims?.sub) return { ok: false, status: 401, message: "The access token is invalid or has expired. Reconnect to sign in again." };

  const { data: m, error: mErr } = await db
    .from("members")
    .select("role, organizations(id, name, region_id, currency, language, default_contingency_pct, default_vat_pct, ai_connect, ai_changes)")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mErr) return { ok: false, status: 500, message: mErr.message };
  const o = m?.organizations;
  if (!m || !o)
    return {
      ok: false,
      status: 403,
      message: "No studio is available to this connection: either you have no studio yet, or your studio's AI access rules don't let your role connect an assistant (Settings → AI access).",
    };
  const role = m.role as Role;
  if (!mayConnect(role, o.ai_connect))
    return { ok: false, status: 403, message: "Your studio's AI access rules don't let your role connect an assistant." };

  return {
    ok: true,
    ctx: {
      userId: claims.sub,
      email: (claims.email as string | undefined) ?? "",
      clientId: (claims.client_id as string | undefined) ?? null,
      studio: {
        id: o.id,
        name: o.name,
        regionId: o.region_id,
        currency: o.currency,
        language: o.language,
        contingencyPct: Number(o.default_contingency_pct),
        vatPct: Number(o.default_vat_pct),
      },
      role,
      canWrite: role !== "viewer" && mayChange(role, o.ai_changes),
      db,
      change: () => {
        const changeId = `mcp:${crypto.randomUUID()}`;
        return { db: client(token, { "x-change-id": changeId }), changeId };
      },
    },
  };
}
