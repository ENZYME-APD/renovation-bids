import "server-only";
import type { Database } from "@/lib/database.types";
import { describe, groupChanges, type ActivityRow } from "@/lib/activity";
import { effectiveCatalogue } from "@/lib/catalogue";
import type { Db, McpContext } from "./context";

// Tools for the AI connection. Every query runs as the signed-in user, so row-level security
// scopes it to their studio and role; tools that change data are only listed when the studio's
// AI rules let this user's assistant make changes.

export class ToolError extends Error {}

type Json = Record<string, unknown>;
type Enums = Database["public"]["Enums"];

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  writes?: boolean;
  destructive?: boolean;
  run: (args: Json, ctx: McpContext) => Promise<unknown>;
}

// ---------- argument helpers ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(a: Json, k: string): string | undefined;
function str(a: Json, k: string, required: true): string;
function str(a: Json, k: string, required = false) {
  const v = a[k];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`${k} is required.`);
    return undefined;
  }
  return String(v).trim();
}
function num(a: Json, k: string): number | undefined;
function num(a: Json, k: string, required: true): number;
function num(a: Json, k: string, required = false) {
  const v = a[k];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`${k} is required.`);
    return undefined;
  }
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) throw new ToolError(`${k} must be a number.`);
  return n;
}
function oneOf<T extends string>(a: Json, k: string, allowed: readonly T[], fallback?: T): T | undefined {
  const v = str(a, k);
  if (v === undefined) return fallback;
  if (!allowed.includes(v as T)) throw new ToolError(`${k} must be one of: ${allowed.join(", ")}.`);
  return v as T;
}
const date = (a: Json, k: string) => {
  const v = str(a, k);
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ToolError(`${k} must be a date as YYYY-MM-DD.`);
  return v;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Unwraps a Supabase result; database errors become messages the assistant can act on. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (res.error) throw new ToolError(res.error.message);
  return (res.data ?? null) as NonNullable<T>;
}

const P = (description: string, type = "string", extra: Json = {}) => ({ type, description, ...extra });
const schema = (properties: Json, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const PROJECT_STATUS: Enums["project_status"][] = ["lead", "qualifying", "no_go", "site_visit", "design", "pricing", "offer_sent", "won", "lost", "on_hold"];
const LINE_STATE: Enums["line_state"][] = ["unpriced", "priced", "needs_rfq", "quoted"];
const LINE_SOURCE: Enums["line_source"][] = ["manual", "template", "model_zone", "model_element", "ai_assumption", "import"];
const SOURCE_HELP = "Where the quantities come from: manual, template, model_zone (a zone/room from Archicad or other BIM), model_element, ai_assumption (your own estimate from photos, a scan or a description), import (a drawing, schedule or spreadsheet)";
const UNITS: Enums["unit"][] = ["m2", "m", "m3", "ud", "kg", "h", "pa"];
const CATEGORY_OUT = ["labour", "materials", "extra"] as const;
const CATEGORY_IN = ["client_works", "client_fees"] as const;

// ---------- lookups ----------

async function project(db: Db, ref: string) {
  const q = db.from("projects").select("id, code, name, status, area_m2");
  const { data } = UUID.test(ref) ? await q.eq("id", ref).limit(1) : await q.ilike("code", ref).limit(1);
  if (data?.length) return data[0];
  const { data: byName } = await db.from("projects").select("id, code, name, status, area_m2").ilike("name", `%${ref}%`).limit(3);
  if (byName?.length === 1) return byName[0];
  if (byName && byName.length > 1) throw new ToolError(`"${ref}" matches several projects (${byName.map((p) => p.code).join(", ")}). Use the code.`);
  throw new ToolError(`No project "${ref}". Use list_projects to find its code.`);
}

async function version(db: Db, a: Json) {
  const id = str(a, "version_id");
  if (id) {
    const v = check(await db.from("versions").select("id, label, status, project_id").eq("id", id).maybeSingle());
    if (!v) throw new ToolError(`No version ${id}.`);
    return v;
  }
  const ref = str(a, "project");
  if (!ref) throw new ToolError("Give version_id, or project (and optionally version label).");
  const p = await project(db, ref);
  const label = str(a, "version");
  if (label) {
    const v = check(await db.from("versions").select("id, label, status, project_id").eq("project_id", p.id).eq("label", label).maybeSingle());
    if (!v) throw new ToolError(`Project ${p.code} has no version ${label}.`);
    return v;
  }
  const main = check(await db.from("project_main_version").select("version_id").eq("project_id", p.id).maybeSingle());
  if (!main?.version_id) throw new ToolError(`Project ${p.code} has no version yet.`);
  return check(await db.from("versions").select("id, label, status, project_id").eq("id", main.version_id).single());
}

async function partida(ctx: McpContext, ref: string) {
  const q = ctx.db.from("partidas").select("id, code, short_description, unit, trade_id, organization_id, active").eq("region_id", ctx.studio.regionId);
  const rows = check(UUID.test(ref) ? await q.eq("id", ref) : await q.ilike("code", ref));
  if (!rows.length) throw new ToolError(`No partida "${ref}". Use search_catalogue to find its code.`);
  // The studio's own version of a code replaces the standard one; an inactive one hides it.
  const sameCode = UUID.test(ref) ? check(await ctx.db.from("partidas").select("id, code, short_description, unit, trade_id, organization_id, active").eq("region_id", ctx.studio.regionId).eq("code", rows[0].code)) : rows;
  const pick = effectiveCatalogue(sameCode, ctx.studio.id, { includeHidden: true })[0];
  if (!pick || pick.hidden) throw new ToolError(`${rows[0].code} is hidden in this studio's catalogue.`);
  return pick;
}

async function supplier(db: Db, ref: string) {
  const q = db.from("suppliers").select("id, name, email");
  const rows = check(UUID.test(ref) ? await q.eq("id", ref) : await q.ilike("name", `%${ref}%`).limit(3));
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) throw new ToolError(`"${ref}" matches several suppliers (${rows.map((s) => s.name).join(", ")}).`);
  throw new ToolError(`No supplier "${ref}". Use list_suppliers, or create_supplier.`);
}

async function trade(ctx: McpContext, ref: string) {
  const q = ctx.db.from("trades").select("id, code, name").eq("region_id", ctx.studio.regionId);
  const rows = check(UUID.test(ref) ? await q.eq("id", ref) : await q.or(`code.ilike.${ref.replace(/[,()%]/g, "")},name.ilike.%${ref.replace(/[,()%]/g, "")}%`));
  if (!rows.length) throw new ToolError(`No chapter "${ref}". Chapters have codes like DEM, ALB, REV, ELE.`);
  return rows[0];
}

async function bestPrices(ctx: McpContext) {
  const rows = check(await ctx.db.rpc("current_prices", { p_org: ctx.studio.id }));
  return new Map(rows.map((r) => [r.partida_id, r]));
}

function lineIds(a: Json): string[] {
  const ids = Array.isArray(a.line_ids) ? (a.line_ids as unknown[]).map(String) : [];
  const one = str(a, "line_id");
  if (one) ids.push(one);
  if (!ids.length) throw new ToolError("Give line_ids (or line_id).");
  return ids;
}

const done = (changeId: string, extra: Json) => ({ change_id: changeId, ...extra, note: "Undo with undo_change and this change_id." });

// ---------- read tools ----------

const READ: ToolDef[] = [
  {
    name: "get_overview",
    title: "Studio overview",
    description: "The studio (name, currency, your role, whether this connection can make changes), projects by status, pipeline and won value, and the most urgent action items. Call this first.",
    inputSchema: schema({}),
    run: async (_a, ctx) => {
      const stats = check(await ctx.db.from("project_stats").select("code, name, status, subtotal, budget_low, budget_high, contract_value, eur_per_m2, updated_at"));
      const byStatus: Record<string, number> = {};
      for (const s of stats) byStatus[s.status ?? "?"] = (byStatus[s.status ?? "?"] ?? 0) + 1;
      const open = stats.filter((s) => ["pricing", "offer_sent", "design", "site_visit"].includes(s.status ?? ""));
      const won = stats.filter((s) => s.status === "won");
      const actions = check(await ctx.db.from("action_items").select("kind, title, project_code, due_on, priority").order("priority").order("due_on", { nullsFirst: false }).limit(15));
      return {
        studio: { name: ctx.studio.name, currency: ctx.studio.currency, language: ctx.studio.language, default_contingency_pct: ctx.studio.contingencyPct, default_vat_pct: ctx.studio.vatPct },
        you: { email: ctx.email, role: ctx.role, connection_can_make_changes: ctx.canWrite },
        projects: { total: stats.length, by_status: byStatus },
        pipeline: { projects: open.length, budget_mid: Math.round(open.reduce((t, s) => t + Number(s.subtotal ?? 0), 0)) },
        won: { projects: won.length, contract_value: Math.round(won.reduce((t, s) => t + Number(s.contract_value ?? s.subtotal ?? 0), 0)) },
        action_items: actions,
      };
    },
  },
  {
    name: "list_projects",
    title: "List projects",
    description: "Projects with status, area, budget of the main version (subtotal and low–high range, before VAT), €/m² and how many lines are priced.",
    inputSchema: schema({ status: P("Only this status", "string", { enum: PROJECT_STATUS }), search: P("Text in the code or name") }),
    run: async (a, ctx) => {
      let q = ctx.db.from("project_stats").select("project_id, code, name, status, district, area_m2, version_label, subtotal, budget_low, budget_high, eur_per_m2, lines, priced_lines, contract_value, phase, updated_at").order("updated_at", { ascending: false }).limit(200);
      const status = oneOf(a, "status", PROJECT_STATUS);
      if (status) q = q.eq("status", status);
      const s = str(a, "search");
      if (s) q = q.or(`code.ilike.%${s.replace(/[,()]/g, "")}%,name.ilike.%${s.replace(/[,()]/g, "")}%`);
      return check(await q);
    },
  },
  {
    name: "get_project",
    title: "Get a project",
    description: "A project with its phase, client, versions and their totals, the signed contract and change orders (contract, approved and pending changes, current budget), client requests, money summary and action items. project is the code (PRJ-0001), id or part of the name.",
    inputSchema: schema({ project: P("Project code, id or name") }, ["project"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const [full, versions, decisions, money, actions] = await Promise.all([
        ctx.db.from("projects").select("*, clients(name, email, phone, client_type)").eq("id", p.id).single(),
        ctx.db.from("versions").select("id, label, description, status, locked, created_at").eq("project_id", p.id).order("label"),
        ctx.db.from("decisions").select("id, request, status, source, requested_by, impact, decided_on").eq("project_id", p.id).order("decided_on", { ascending: false }),
        ctx.db.from("project_money").select("*").eq("project_id", p.id).maybeSingle(),
        ctx.db.from("action_items").select("kind, title, due_on, priority").eq("project_id", p.id),
      ]);
      const vs = check(versions);
      const totals = vs.length ? check(await ctx.db.from("version_totals").select("*").in("version_id", vs.map((v) => v.id))) : [];
      const [summary, cos] = await Promise.all([
        ctx.db.from("project_budget_summary").select("contract_budget, approved_changes, pending_changes, current_budget, contract_signed_on").eq("project_id", p.id).maybeSingle(),
        ctx.db.from("change_order_totals").select("change_order_id, number, status, total, lines").eq("project_id", p.id).order("number"),
      ]);
      const coRows = check(cos);
      const coInfo = coRows.length ? check(await ctx.db.from("change_orders").select("id, title, reason, approved_by, sent_on, decided_on").in("id", coRows.map((c) => c.change_order_id!))) : [];
      return {
        project: check(full),
        contract: check(summary),
        change_orders: coRows.map((c) => ({ ...coInfo.find((i) => i.id === c.change_order_id), number: `CO-${String(c.number).padStart(2, "0")}`, status: c.status, total: Number(c.total), lines: c.lines })),
        versions: vs.map((v) => ({ ...v, totals: totals.find((t) => t.version_id === v.id) ?? null })),
        client_requests: check(decisions),
        money: check(money),
        action_items: check(actions),
      };
    },
  },
  {
    name: "get_version_budget",
    title: "Get a budget",
    description: "The budget of a version: every line (partida code, description, unit, quantity, unit price, total, state, confidence, room) and the totals per chapter. Give version_id, or project (and optionally version label; default is the main version).",
    inputSchema: schema({ version_id: P("Version id"), project: P("Project code, id or name"), version: P("Version label, e.g. A") }),
    run: async (a, ctx) => {
      const v = await version(ctx.db, a);
      const [lines, chapters] = await Promise.all([
        ctx.db.from("line_items").select("id, quantity, unit_price, total, state, confidence, notes, room, source, source_ref, overridden, partidas(code, short_description, unit, trades(code, name))").eq("version_id", v.id).order("created_at"),
        ctx.db.rpc("version_budget", { p_version: v.id }),
      ]);
      const ch = check(chapters);
      return {
        version: v,
        currency: ctx.studio.currency,
        lines: check(lines).map((l) => ({
          line_id: l.id, code: l.partidas?.code, description: l.partidas?.short_description, unit: l.partidas?.unit,
          chapter: l.partidas?.trades?.name, quantity: Number(l.quantity), unit_price: l.unit_price == null ? null : Number(l.unit_price),
          total: l.total == null ? null : Number(l.total), state: l.state, confidence: l.confidence, room: l.room, notes: l.notes,
        })),
        chapters: ch,
        subtotal: ch.reduce((t, c) => t + Number(c.subtotal ?? 0), 0),
      };
    },
  },
  {
    name: "search_catalogue",
    title: "Search the catalogue",
    description: "Find partidas (standard work items) by code or words in the description, optionally within a chapter (DEM, ALB, REV, PAV, ELE…), with the studio's current best price.",
    inputSchema: schema({ query: P("Code or words, e.g. 'alicatado' or 'REV-0'"), chapter: P("Chapter code or name") }, ["query"]),
    run: async (a, ctx) => {
      const query = str(a, "query", true).replace(/[,()]/g, "");
      let q = ctx.db.from("partidas").select("id, code, short_description, unit, trade_id, active, organization_id, trades(code, name)").eq("region_id", ctx.studio.regionId).or(`code.ilike.%${query}%,short_description.ilike.%${query}%`).order("code").limit(40);
      const ch = str(a, "chapter");
      if (ch) q = q.eq("trade_id", (await trade(ctx, ch)).id);
      const [rows, prices] = await Promise.all([q, bestPrices(ctx)]);
      // Fetch every partida sharing a matched code, so a studio version always replaces the standard one.
      const codes = [...new Set(check(rows).map((r) => r.code))];
      const all = codes.length
        ? check(await ctx.db.from("partidas").select("id, code, short_description, unit, trade_id, active, organization_id, trades(code, name)").eq("region_id", ctx.studio.regionId).in("code", codes))
        : [];
      return effectiveCatalogue(all, ctx.studio.id).map((r) => {
        const p = prices.get(r.id);
        return { code: r.code, description: r.short_description, unit: r.unit, chapter: r.trades?.name, studio_version: r.kind !== "standard", price: p ? { unit_price: Number(p.unit_price), source: p.source, confidence: p.confidence, priced_on: p.priced_on } : null };
      });
    },
  },
  {
    name: "list_room_templates",
    title: "List room templates",
    description: "The studio's room templates (kitchen, bathroom, bedroom…): each adds a standard set of lines scaled to the room size. match_terms are the room names / zone categories that map to it. Use with add_room.",
    inputSchema: schema({}),
    run: async (_a, ctx) => {
      const rows = check(await ctx.db.rpc("effective_room_templates", { p_org: ctx.studio.id }).select("id, code, name, size_label, description, match_terms, sequence").eq("active", true));
      const ids = rows.map((t) => t.id);
      const lines = ids.length ? check(await ctx.db.from("room_template_lines").select("template_id").in("template_id", ids)) : [];
      return rows
        .sort((a, b) => a.sequence - b.sequence)
        .map((t) => ({ id: t.id, code: t.code, name: t.name, size_label: t.size_label, description: t.description, match_terms: t.match_terms, lines: lines.filter((l) => l.template_id === t.id).length }));
    },
  },
  {
    name: "list_action_items",
    title: "List action items",
    description: "Things that need doing: suppliers to chase, quotes to review, unpriced lines, offers about to expire, open client requests, invoices due, late deliveries.",
    inputSchema: schema({ project: P("Only this project (code, id or name)") }),
    run: async (a, ctx) => {
      let q = ctx.db.from("action_items").select("*").order("priority").order("due_on", { nullsFirst: false }).limit(100);
      const ref = str(a, "project");
      if (ref) q = q.eq("project_id", (await project(ctx.db, ref)).id);
      return check(await q);
    },
  },
  {
    name: "list_suppliers",
    title: "List suppliers",
    description: "Suppliers and subcontractors with their chapters and response rate.",
    inputSchema: schema({ chapter: P("Only suppliers for this chapter (code or name)"), search: P("Text in the name") }),
    run: async (a, ctx) => {
      let q = ctx.db.from("suppliers").select("id, name, supplier_type, contact_name, email, phone, area_served, opt_out, supplier_trades(trades(code, name))").order("name").limit(200);
      const s = str(a, "search");
      if (s) q = q.ilike("name", `%${s}%`);
      const [rows, resp] = await Promise.all([q, ctx.db.from("supplier_response").select("supplier_id, response_rate, avg_days_to_reply")]);
      const ch = str(a, "chapter");
      const t = ch ? await trade(ctx, ch) : null;
      const rates = new Map(check(resp).map((r) => [r.supplier_id, r]));
      return check(rows)
        .filter((r) => !t || r.supplier_trades.some((st) => st.trades?.code === t.code))
        .map((r) => ({ ...r, chapters: r.supplier_trades.map((st) => st.trades?.name), supplier_trades: undefined, response: rates.get(r.id) ?? null }));
    },
  },
  {
    name: "get_cost_control",
    title: "Get cost control",
    description: "For a won project: budget vs committed per chapter, purchase orders, supplier invoices with what is outstanding, and money paid out and received.",
    inputSchema: schema({ project: P("Project code, id or name") }, ["project"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const [money, chapters, pos, invoices, payments] = await Promise.all([
        ctx.db.from("project_money").select("*").eq("project_id", p.id).maybeSingle(),
        ctx.db.from("project_cost_by_trade").select("trade, budget, committed, remaining").eq("project_id", p.id).order("sequence"),
        ctx.db.from("purchase_orders").select("id, code, status, supplied_by, ordered_on, expected_on, delivered_on, suppliers(name), purchase_order_lines(description, quantity, unit, unit_cost, received_quantity, total)").eq("project_id", p.id).order("code"),
        ctx.db.from("invoice_balances").select("id, number, supplier, category, issued_on, due_on, total, paid, outstanding").eq("project_id", p.id).order("issued_on"),
        ctx.db.from("payments").select("id, direction, category, amount, paid_on, concept").eq("project_id", p.id).order("paid_on"),
      ]);
      return { project: p, currency: ctx.studio.currency, money: check(money), chapters: check(chapters), purchase_orders: check(pos), invoices: check(invoices), payments: check(payments) };
    },
  },
  {
    name: "list_recent_changes",
    title: "List recent changes",
    description: "The activity log: recent changes grouped by change_id, with who made them, from where (app or AI assistant) and whether they were undone.",
    inputSchema: schema({ limit: P("How many changes (default 20, max 100)", "number"), only_ai: P("Only changes made by assistants", "boolean") }),
    run: async (a, ctx) => {
      const limit = Math.min(Math.max(num(a, "limit") ?? 20, 1), 100);
      let q = ctx.db.from("activity_log").select("*").order("occurred_at", { ascending: false }).limit(limit * 10);
      if (a.only_ai === true) q = q.eq("source", "ai");
      return groupChanges(check(await q) as ActivityRow[]).slice(0, limit).map((c) => ({
        change_id: c.changeId, at: c.at, by: c.actor, source: c.source, undone: c.undone, is_undo: c.isUndo, what: c.items.map(describe),
      }));
    },
  },
];

// ---------- write tools ----------

const WRITE: ToolDef[] = [
  {
    name: "set_phase",
    title: "Set a project's phase",
    description: "Move a project to a phase: bid (pre-contract), design, construction or closed. Winning moves a bid to design on its own.",
    writes: true,
    inputSchema: schema({ project: P("Project code, id or name"), phase: P("Phase", "string", { enum: ["bid", "design", "construction", "closed"] }) }, ["project", "phase"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const { db, changeId } = ctx.change();
      const row = check(await db.from("projects").update({ phase: oneOf(a, "phase", ["bid", "design", "construction", "closed"] as const)! }).eq("id", p.id).select("code, phase, status").single());
      return done(changeId, { project: row });
    },
  },
  {
    name: "sign_contract",
    title: "Sign the contract",
    description: "Record the signed contract: copies the chosen version as a locked 'Contract' baseline, marks the project won and moves it to design. contract_value defaults to the budget total.",
    writes: true,
    inputSchema: schema({ project: P("Project code, id or name"), version: P("Label of the version signed, e.g. A"), contract_value: P("Agreed value before VAT", "number"), signed_on: P("Date YYYY-MM-DD (default today)") }, ["project", "version"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const v = await version(ctx.db, { project: p.id, version: str(a, "version", true) });
      const { db, changeId } = ctx.change();
      const id = check(await db.rpc("sign_contract", { p_project: p.id, p_version: v.id, p_value: num(a, "contract_value"), p_signed_on: date(a, "signed_on") ?? today() }));
      const summary = check(await ctx.db.from("project_budget_summary").select("contract_budget, contract_value, contract_signed_on").eq("project_id", p.id).single());
      return done(changeId, { contract_version_id: id, ...summary });
    },
  },
  {
    name: "create_change_order",
    title: "Create a change order",
    description: "After the contract: create a draft change order, optionally from a client request, with lines. Each line is a partida code (price defaults to the studio's best) or a free description with unit and unit_price. Negative quantity = work taken out.",
    writes: true,
    inputSchema: schema({
      project: P("Project code, id or name"), title: P("Short title"), description: P("Description"),
      reason: P("Reason", "string", { enum: ["client_request", "design_change", "site_condition", "omission", "other"] }),
      client_request_id: P("Id of the client request it prices"),
      lines: P("Lines", "array", { items: { type: "object", properties: { partida: { type: "string" }, description: { type: "string" }, quantity: { type: "number" }, unit: { type: "string", enum: UNITS }, unit_price: { type: "number" }, room: { type: "string" } } } }),
    }, ["project", "title"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const input = Array.isArray(a.lines) ? (a.lines as Json[]) : [];
      const prices = input.length ? await bestPrices(ctx) : new Map();
      const lines = await Promise.all(input.map(async (l) => {
        const ref = str(l, "partida");
        const pt = ref ? await partida(ctx, ref) : null;
        const description = str(l, "description") ?? pt?.short_description;
        if (!description) throw new ToolError("Each line needs a partida or a description.");
        const quantity = num(l, "quantity", true);
        if (quantity === 0) throw new ToolError("Quantities can't be 0.");
        const unitPrice = num(l, "unit_price") ?? (pt ? Number(prices.get(pt.id)?.unit_price ?? NaN) : NaN);
        if (!Number.isFinite(unitPrice)) throw new ToolError(`No price for ${pt?.code ?? description}; give unit_price.`);
        return { partida_id: pt?.id ?? null, description, unit: (pt?.unit ?? oneOf(l, "unit", UNITS) ?? "ud") as Enums["unit"], quantity, unit_price: unitPrice, room: str(l, "room") ?? null };
      }));
      const { db, changeId } = ctx.change();
      const co = check(await db.from("change_orders").insert({
        organization_id: ctx.studio.id, project_id: p.id, title: str(a, "title", true), description: str(a, "description") ?? null,
        reason: oneOf(a, "reason", ["client_request", "design_change", "site_condition", "omission", "other"] as const, a.client_request_id ? "client_request" : "other")!,
        decision_id: str(a, "client_request_id") ?? null,
      }).select("id, number, status").single());
      if (lines.length) check(await db.from("change_order_lines").insert(lines.map((l) => ({ ...l, organization_id: ctx.studio.id, change_order_id: co.id }))));
      const total = lines.reduce((t, l) => t + Math.round(l.quantity * l.unit_price * 100) / 100, 0);
      return done(changeId, { change_order: { id: co.id, number: `CO-${String(co.number).padStart(2, "0")}`, status: co.status, total, lines: lines.length } });
    },
  },
  {
    name: "update_change_order",
    title: "Update a change order",
    description: "Move a change order on: sent (to the client), approved (needs approved_by, the client's name), rejected, draft or cancelled. Approved changes add to the current budget and freeze their lines.",
    writes: true,
    inputSchema: schema({
      change_order_id: P("Change order id (from get_project)"), status: P("New status", "string", { enum: ["draft", "sent", "approved", "rejected", "cancelled"] }),
      approved_by: P("Client person who approved"), date: P("Date of sending or decision YYYY-MM-DD (default today)"),
    }, ["change_order_id", "status"]),
    run: async (a, ctx) => {
      const status = oneOf(a, "status", ["draft", "sent", "approved", "rejected", "cancelled"] as const)!;
      const patch: Database["public"]["Tables"]["change_orders"]["Update"] = { status };
      const d = date(a, "date") ?? today();
      if (status === "sent") patch.sent_on = d;
      if (status === "draft") patch.sent_on = null;
      if (status === "approved" || status === "rejected") patch.decided_on = d;
      if (status === "approved") {
        const by = str(a, "approved_by");
        if (!by) throw new ToolError("approved_by is required: who approved it on the client side?");
        patch.approved_by = by;
      }
      const { db, changeId } = ctx.change();
      const row = check(await db.from("change_orders").update(patch).eq("id", str(a, "change_order_id", true)).select("number, title, status").maybeSingle());
      if (!row) throw new ToolError("No such change order, or you can't change it.");
      return done(changeId, { change_order: { ...row, number: `CO-${String(row.number).padStart(2, "0")}` } });
    },
  },
  {
    name: "create_project",
    title: "Create a project",
    description: "Create a project (it gets the next code, PRJ-0001…) with an empty version A. Optionally creates its client.",
    writes: true,
    inputSchema: schema({
      name: P("Project name, e.g. 'Piso Ortega y Gasset 47'"), client: P("Client name (creates the client)"), address: P("Address"), district: P("District, e.g. Salamanca"),
      area_m2: P("Built area in m²", "number"), building_year: P("Year the building was built", "number"), client_budget: P("The client's budget, if they said one", "number"),
    }, ["name"]),
    run: async (a, ctx) => {
      const { db, changeId } = ctx.change();
      let clientId: string | null = null;
      const clientName = str(a, "client");
      if (clientName) clientId = check(await db.from("clients").insert({ organization_id: ctx.studio.id, name: clientName }).select("id").single()).id;
      const p = check(await db.from("projects").insert({
        organization_id: ctx.studio.id, name: str(a, "name", true), client_id: clientId, address: str(a, "address") ?? null, district: str(a, "district") ?? null,
        area_m2: num(a, "area_m2") ?? null, building_year: num(a, "building_year") ?? null, client_budget: num(a, "client_budget") ?? null,
      }).select("id, code, name").single());
      const v = check(await db.from("versions").insert({ organization_id: ctx.studio.id, project_id: p.id, label: "A", description: "Initial scope" }).select("id").single());
      return done(changeId, { project: p, version_id: v.id });
    },
  },
  {
    name: "update_project",
    title: "Update a project",
    description: "Change a project's details or status (lead, qualifying, no_go, site_visit, design, pricing, offer_sent, won, lost, on_hold). Only the fields given change.",
    writes: true,
    inputSchema: schema({
      project: P("Project code, id or name"), name: P("New name"), status: P("New status", "string", { enum: PROJECT_STATUS }), address: P("Address"), district: P("District"),
      area_m2: P("Area in m²", "number"), client_budget: P("Client budget", "number"), contract_value: P("Signed contract value", "number"), outcome_reason: P("Why it was won or lost"),
    }, ["project"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const patch: Database["public"]["Tables"]["projects"]["Update"] = {};
      for (const k of ["name", "address", "district", "outcome_reason"] as const) if (str(a, k) !== undefined) patch[k] = str(a, k);
      for (const k of ["area_m2", "client_budget", "contract_value"] as const) if (num(a, k) !== undefined) patch[k] = num(a, k);
      const status = oneOf(a, "status", PROJECT_STATUS);
      if (status) patch.status = status;
      if (!Object.keys(patch).length) throw new ToolError("Nothing to change.");
      const { db, changeId } = ctx.change();
      const row = check(await db.from("projects").update(patch).eq("id", p.id).select("code, name, status").single());
      return done(changeId, { project: row });
    },
  },
  {
    name: "create_version",
    title: "Create a version",
    description: "Add a version (option) to a project, optionally copying the lines of another version. Unless the studio allows options in the bid, only one version until the project is won. model_tool/model_option record where the option lives (e.g. an Archicad design option).",
    writes: true,
    inputSchema: schema({
      project: P("Project code, id or name"), label: P("Label, e.g. B"), description: P("What differs"), copy_from: P("Label of the version to copy, e.g. A"),
      model_tool: P("Where the design lives", "string", { enum: ["archicad", "revit", "sketchup", "other_bim", "drawings", "ai", "none"] }), model_option: P("Design option, file or drawing set name"),
    }, ["project", "label"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const { db, changeId } = ctx.change();
      const v = check(await db.from("versions").insert({
        organization_id: ctx.studio.id, project_id: p.id, label: str(a, "label", true), description: str(a, "description") ?? null,
        model_tool: str(a, "model_tool") ?? null, model_option: str(a, "model_option") ?? null,
      }).select("id, label").single());
      const from = str(a, "copy_from");
      let copied = 0;
      if (from) {
        const src = await version(ctx.db, { project: p.id, version: from });
        const lines = check(await ctx.db.from("line_items").select("partida_id, quantity, unit_price, price_id, confidence, state, archicad_element_ids, notes, room, source, source_ref, template_id, overridden").eq("version_id", src.id));
        if (lines.length) check(await db.from("line_items").insert(lines.map((l) => ({ ...l, organization_id: ctx.studio.id, version_id: v.id }))));
        copied = lines.length;
      }
      return done(changeId, { version: v, lines_copied: copied });
    },
  },
  {
    name: "add_room",
    title: "Add a room",
    description: "Add a room from a template (list_room_templates): its standard lines with quantities scaled to the size, each tagged with the room name. Omit template to pick it from the room name or zone category (match_terms). Works the same whether rooms come from Archicad zones, another BIM tool, a drawing, or your own assumptions: set source and source_ref (e.g. the zone id) so later syncs can find the lines.",
    writes: true,
    inputSchema: schema({
      version_id: P("Version id"), project: P("Project (uses its main version)"), version: P("Version label"), template: P("Template code or id; omit to match by label/category"),
      size: P("Room size in the template's unit (m² of floor, or number of windows)", "number"), label: P("Name for the room, e.g. 'Baño principal'"), category: P("Zone category, if different from the name"),
      source: P(SOURCE_HELP, "string", { enum: LINE_SOURCE }), source_ref: P("Stable id in the source, e.g. the Archicad zone GUID"),
    }, ["size"]),
    run: async (a, ctx) => {
      const v = await version(ctx.db, a);
      const ref = str(a, "template");
      let t: { id: string; name: string } | undefined;
      if (ref) {
        const tq = ctx.db.rpc("effective_room_templates", { p_org: ctx.studio.id }).select("id, name").eq("active", true);
        t = check(UUID.test(ref) ? await tq.eq("id", ref) : await tq.ilike("code", ref))[0];
        if (!t) throw new ToolError(`No room template "${ref}".`);
      } else {
        const name = str(a, "category") ?? str(a, "label");
        if (!name) throw new ToolError("Give a template, or a label/category to match one.");
        const id = check(await ctx.db.rpc("match_room_template", { p_org: ctx.studio.id, p_name: name }));
        if (!id) throw new ToolError(`No template matches "${name}". Pick one with list_room_templates, or add the term to a template's match_terms.`);
        t = check(await ctx.db.from("room_templates").select("id, name").eq("id", id).single());
      }
      const source = oneOf(a, "source", LINE_SOURCE) ?? "template";
      const { db, changeId } = ctx.change();
      const n = check(await db.rpc("apply_room_template", {
        p_version: v.id, p_template: t.id, p_size: num(a, "size", true), p_label: str(a, "label"), p_source: source, p_source_ref: str(a, "source_ref"),
      }));
      return done(changeId, { version: v.label, template: t.name, lines_added: n, source });
    },
  },
  {
    name: "add_line",
    title: "Add a budget line",
    description: "Add a partida to a version's budget. Without unit_price, the studio's best current price is used.",
    writes: true,
    inputSchema: schema({ version_id: P("Version id"), project: P("Project (uses its main version)"), version: P("Version label"), partida: P("Partida code, e.g. REV-010"), quantity: P("Quantity in the partida's unit", "number"), unit_price: P("Unit price, if not the catalogue price", "number"), room: P("Room it belongs to, e.g. Cocina"), notes: P("Notes"), source: P(SOURCE_HELP, "string", { enum: LINE_SOURCE }), source_ref: P("Stable id in the source, e.g. an element GUID or drawing ref") }, ["partida", "quantity"]),
    run: async (a, ctx) => {
      const v = await version(ctx.db, a);
      const pt = await partida(ctx, str(a, "partida", true));
      let unitPrice = num(a, "unit_price") ?? null;
      let priceId: string | null = null;
      let confidence: Enums["confidence"] | null = unitPrice != null ? "medium" : null;
      if (unitPrice == null) {
        const best = (await bestPrices(ctx)).get(pt.id);
        if (best) { unitPrice = Number(best.unit_price); priceId = best.price_id; confidence = best.confidence; }
      }
      const { db, changeId } = ctx.change();
      const line = check(await db.from("line_items").insert({
        organization_id: ctx.studio.id, version_id: v.id, partida_id: pt.id, quantity: num(a, "quantity", true), unit_price: unitPrice, price_id: priceId,
        confidence, state: unitPrice != null ? "priced" : "unpriced", room: str(a, "room") ?? null, notes: str(a, "notes") ?? null,
        source: oneOf(a, "source", LINE_SOURCE) ?? "manual", source_ref: str(a, "source_ref") ?? null,
      }).select("id, quantity, unit_price, total, state, source").single());
      return done(changeId, { line: { ...line, code: pt.code, description: pt.short_description, unit: pt.unit } });
    },
  },
  {
    name: "update_line",
    title: "Update budget lines",
    description: "Change one or several lines at once (line_ids from get_version_budget): quantity or a quantity factor, unit price, confidence, state (unpriced, priced, needs_rfq, quoted), room (empty string clears it) or notes. All lines change in one change_id.",
    writes: true,
    inputSchema: schema({
      line_ids: P("Line ids", "array", { items: { type: "string" } }), line_id: P("A single line id (instead of line_ids)"),
      quantity: P("New quantity", "number"), quantity_factor: P("Multiply quantities by this, e.g. 1.1", "number"), unit_price: P("Unit price", "number"),
      confidence: P("Confidence", "string", { enum: ["high", "medium", "low"] }), state: P("State", "string", { enum: LINE_STATE }), room: P("Room; empty string clears it"), notes: P("Notes"),
    }),
    run: async (a, ctx) => {
      const ids = lineIds(a);
      const patch: Database["public"]["Tables"]["line_items"]["Update"] = {};
      if (num(a, "quantity") !== undefined) patch.quantity = num(a, "quantity");
      if (num(a, "unit_price") !== undefined) { patch.unit_price = num(a, "unit_price"); patch.price_id = null; patch.confidence = "medium"; patch.state = "priced"; }
      const confidence = oneOf(a, "confidence", ["high", "medium", "low"] as const);
      if (confidence) patch.confidence = confidence;
      const state = oneOf(a, "state", LINE_STATE);
      if (state) patch.state = state;
      if (a.room !== undefined) patch.room = String(a.room ?? "").trim() || null;
      if (str(a, "notes") !== undefined) patch.notes = str(a, "notes");
      const factor = num(a, "quantity_factor");
      if (!Object.keys(patch).length && factor === undefined) throw new ToolError("Nothing to change.");
      if (factor !== undefined && !(factor > 0)) throw new ToolError("quantity_factor must be more than 0.");
      const { db, changeId } = ctx.change();
      let rows: { id: string }[] = [];
      if (Object.keys(patch).length) rows = check(await db.from("line_items").update(patch).in("id", ids).select("id"));
      if (factor !== undefined) {
        const current = check(await ctx.db.from("line_items").select("id, quantity").in("id", ids));
        for (const r of current) check(await db.from("line_items").update({ quantity: Math.round(Number(r.quantity) * factor * 1000) / 1000 }).eq("id", r.id));
        rows = current;
      }
      if (!rows.length) throw new ToolError("No such lines, or you can't change them.");
      return done(changeId, { updated: rows.length });
    },
  },
  {
    name: "remove_line",
    title: "Remove budget lines",
    description: "Remove one or several lines from a budget, in one change_id.",
    writes: true,
    destructive: true,
    inputSchema: schema({ line_ids: P("Line ids", "array", { items: { type: "string" } }), line_id: P("A single line id (instead of line_ids)") }),
    run: async (a, ctx) => {
      const { db, changeId } = ctx.change();
      const rows = check(await db.from("line_items").delete().in("id", lineIds(a)).select("id"));
      if (!rows.length) throw new ToolError("No such lines, or you can't remove them.");
      return done(changeId, { removed: rows.length });
    },
  },
  {
    name: "record_client_request",
    title: "Record a client request",
    description: "Log something the client asked for (a change, an option, a preference). During the bid it stays open; it is applied once the project is won.",
    writes: true,
    inputSchema: schema({ project: P("Project code, id or name"), request: P("What they asked for"), requested_by: P("Who asked"), source: P("Where", "string", { enum: ["email", "meeting", "call", "site", "other"] }), impact: P("Expected impact on cost or time") }, ["project", "request"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const { db, changeId } = ctx.change();
      const row = check(await db.from("decisions").insert({
        organization_id: ctx.studio.id, project_id: p.id, request: str(a, "request", true), requested_by: str(a, "requested_by") ?? null,
        source: oneOf(a, "source", ["email", "meeting", "call", "site", "other"] as const, "other")!, impact: str(a, "impact") ?? null,
      }).select("id, request, status").single());
      return done(changeId, { request: row });
    },
  },
  {
    name: "create_supplier",
    title: "Create a supplier",
    description: "Add a supplier or subcontractor, with the chapters they cover.",
    writes: true,
    inputSchema: schema({
      name: P("Company name"), supplier_type: P("Type", "string", { enum: ["subcontractor", "manufacturer", "distributor", "professional"] }), contact_name: P("Contact person"),
      email: P("Email"), phone: P("Phone"), area_served: P("Area served"), chapters: P("Chapter codes they cover, e.g. ['ELE','FON']", "array", { items: { type: "string" } }),
    }, ["name"]),
    run: async (a, ctx) => {
      const { db, changeId } = ctx.change();
      const s = check(await db.from("suppliers").insert({
        organization_id: ctx.studio.id, name: str(a, "name", true), supplier_type: oneOf(a, "supplier_type", ["subcontractor", "manufacturer", "distributor", "professional"] as const, "subcontractor"),
        contact_name: str(a, "contact_name") ?? null, email: str(a, "email") ?? null, phone: str(a, "phone") ?? null, area_served: str(a, "area_served") ?? null,
      }).select("id, name").single());
      const chapters = Array.isArray(a.chapters) ? (a.chapters as unknown[]).map(String) : [];
      const trades = await Promise.all(chapters.map((c) => trade(ctx, c)));
      if (trades.length) check(await db.from("supplier_trades").insert(trades.map((t) => ({ organization_id: ctx.studio.id, supplier_id: s.id, trade_id: t.id }))));
      return done(changeId, { supplier: s, chapters: trades.map((t) => t.name) });
    },
  },
  {
    name: "draft_rfq",
    title: "Draft a request for quote",
    description: "Prepare (not send) a request for a quote to a supplier for some lines of a project. A person approves and sends it from the app.",
    writes: true,
    inputSchema: schema({ project: P("Project code, id or name"), supplier: P("Supplier name or id"), chapter: P("Chapter code it covers"), line_ids: P("Budget line ids to include", "array", { items: { type: "string" } }), reply_by: P("Reply by date YYYY-MM-DD") }, ["project", "supplier"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const s = await supplier(ctx.db, str(a, "supplier", true));
      const ch = str(a, "chapter");
      const t = ch ? await trade(ctx, ch) : null;
      const { db, changeId } = ctx.change();
      const r = check(await db.from("rfqs").insert({ organization_id: ctx.studio.id, project_id: p.id, supplier_id: s.id, trade_id: t?.id ?? null, reply_by: date(a, "reply_by") ?? null }).select("id, status").single());
      const ids = Array.isArray(a.line_ids) ? (a.line_ids as unknown[]).map(String) : [];
      if (ids.length) check(await db.from("rfq_line_items").insert(ids.map((id) => ({ organization_id: ctx.studio.id, rfq_id: r.id, line_item_id: id }))));
      return done(changeId, { rfq: r, supplier: s.name, lines: ids.length });
    },
  },
  {
    name: "record_quote",
    title: "Record a quote",
    description: "Record a supplier's quote against a request for quote.",
    writes: true,
    inputSchema: schema({ rfq_id: P("Request for quote id"), total: P("Quoted total before VAT", "number"), valid_until: P("Valid until YYYY-MM-DD"), exclusions: P("What it excludes") }, ["rfq_id", "total"]),
    run: async (a, ctx) => {
      const { db, changeId } = ctx.change();
      const q = check(await db.from("quotes").insert({ organization_id: ctx.studio.id, rfq_id: str(a, "rfq_id", true), total: num(a, "total", true), valid_until: date(a, "valid_until") ?? null, exclusions: str(a, "exclusions") ?? null, parsed_by_ai: true }).select("id, total").single());
      return done(changeId, { quote: q });
    },
  },
  {
    name: "create_purchase_order",
    title: "Create a purchase order",
    description: "Create a draft purchase order for a project. Each line either references a budget line (line_item_id; description, unit and quantity default from it) or is free (description, unit, quantity). unit_cost is what the supplier charges per unit.",
    writes: true,
    inputSchema: schema({
      project: P("Project code, id or name"), supplier: P("Supplier name or id"), supplied_by: P("Who buys it", "string", { enum: ["enzyme", "contractor", "owner"] }), expected_on: P("Expected delivery YYYY-MM-DD"), notes: P("Notes"),
      lines: P("Lines", "array", { items: { type: "object", properties: { line_item_id: { type: "string" }, partida: { type: "string" }, description: { type: "string" }, quantity: { type: "number" }, unit: { type: "string", enum: UNITS }, unit_cost: { type: "number" } } } }),
    }, ["project", "lines"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const sRef = str(a, "supplier");
      const s = sRef ? await supplier(ctx.db, sRef) : null;
      const input = Array.isArray(a.lines) ? (a.lines as Json[]) : [];
      if (!input.length) throw new ToolError("Add at least one line.");
      const lines = await Promise.all(input.map(async (l) => {
        const liId = str(l, "line_item_id");
        if (liId) {
          const li = check(await ctx.db.from("line_items").select("id, quantity, unit_price, partida_id, partidas(short_description, unit)").eq("id", liId).maybeSingle());
          if (!li) throw new ToolError(`No budget line ${liId}.`);
          return { line_item_id: li.id, partida_id: li.partida_id, description: str(l, "description") ?? li.partidas?.short_description ?? "", unit: (oneOf(l, "unit", UNITS) ?? li.partidas?.unit ?? "ud") as Enums["unit"], quantity: num(l, "quantity") ?? Number(li.quantity), unit_cost: num(l, "unit_cost") ?? Number(li.unit_price ?? 0) };
        }
        const ptRef = str(l, "partida");
        const pt = ptRef ? await partida(ctx, ptRef) : null;
        const description = str(l, "description") ?? pt?.short_description;
        if (!description) throw new ToolError("Each free line needs a description or a partida.");
        return { line_item_id: null, partida_id: pt?.id ?? null, description, unit: (oneOf(l, "unit", UNITS) ?? pt?.unit ?? "ud") as Enums["unit"], quantity: num(l, "quantity", true), unit_cost: num(l, "unit_cost", true) };
      }));
      const { db, changeId } = ctx.change();
      const po = check(await db.from("purchase_orders").insert({ organization_id: ctx.studio.id, project_id: p.id, supplier_id: s?.id ?? null, supplied_by: oneOf(a, "supplied_by", ["enzyme", "contractor", "owner"] as const, "contractor"), expected_on: date(a, "expected_on") ?? null, notes: str(a, "notes") ?? null }).select("id, code, status").single());
      const rows = check(await db.from("purchase_order_lines").insert(lines.map((l) => ({ ...l, organization_id: ctx.studio.id, purchase_order_id: po.id }))).select("description, quantity, unit, unit_cost, total"));
      return done(changeId, { purchase_order: po, supplier: s?.name ?? null, lines: rows, total: rows.reduce((t, r) => t + Number(r.total ?? 0), 0) });
    },
  },
  {
    name: "update_purchase_order",
    title: "Update a purchase order",
    description: "Change a purchase order's status (draft, sent, confirmed, delivered, cancelled) or dates. Marking it delivered sets every line as fully received.",
    writes: true,
    inputSchema: schema({ purchase_order: P("PO code (PO-0001) or id"), status: P("Status", "string", { enum: ["draft", "sent", "confirmed", "delivered", "cancelled"] }), ordered_on: P("YYYY-MM-DD"), expected_on: P("YYYY-MM-DD"), delivered_on: P("YYYY-MM-DD") }, ["purchase_order"]),
    run: async (a, ctx) => {
      const ref = str(a, "purchase_order", true);
      const q = ctx.db.from("purchase_orders").select("id, code, ordered_on");
      const po = check(UUID.test(ref) ? await q.eq("id", ref) : await q.ilike("code", ref))[0];
      if (!po) throw new ToolError(`No purchase order "${ref}".`);
      const patch: Database["public"]["Tables"]["purchase_orders"]["Update"] = {};
      const status = oneOf(a, "status", ["draft", "sent", "confirmed", "delivered", "cancelled"] as const);
      if (status) patch.status = status;
      for (const k of ["ordered_on", "expected_on", "delivered_on"] as const) if (date(a, k)) patch[k] = date(a, k);
      if (status && !["draft", "cancelled"].includes(status) && !patch.ordered_on && !po.ordered_on) patch.ordered_on = today();
      if (status === "delivered" && !patch.delivered_on) patch.delivered_on = today();
      if (!Object.keys(patch).length) throw new ToolError("Nothing to change.");
      const { db, changeId } = ctx.change();
      const row = check(await db.from("purchase_orders").update(patch).eq("id", po.id).select("code, status, ordered_on, expected_on, delivered_on").single());
      if (status === "delivered") {
        const lines = check(await ctx.db.from("purchase_order_lines").select("id, quantity").eq("purchase_order_id", po.id));
        for (const l of lines) check(await db.from("purchase_order_lines").update({ received_quantity: l.quantity }).eq("id", l.id));
      }
      return done(changeId, { purchase_order: row });
    },
  },
  {
    name: "record_supplier_invoice",
    title: "Record a supplier invoice",
    description: "Record an invoice from a supplier or contractor for a project, optionally against a purchase order. category: labour, materials or extra.",
    writes: true,
    inputSchema: schema({
      project: P("Project code, id or name"), supplier: P("Supplier name or id"), purchase_order: P("PO code or id"), number: P("Invoice number"), issued_on: P("Issue date YYYY-MM-DD (default today)"),
      due_on: P("Due date YYYY-MM-DD"), net_amount: P("Amount before VAT", "number"), vat_amount: P("VAT amount", "number"), category: P("Category", "string", { enum: CATEGORY_OUT }),
    }, ["project", "net_amount", "category"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const sRef = str(a, "supplier");
      const s = sRef ? await supplier(ctx.db, sRef) : null;
      const poRef = str(a, "purchase_order");
      let poId: string | null = null;
      if (poRef) {
        const q = ctx.db.from("purchase_orders").select("id").eq("project_id", p.id);
        poId = check(UUID.test(poRef) ? await q.eq("id", poRef) : await q.ilike("code", poRef))[0]?.id ?? null;
        if (!poId) throw new ToolError(`No purchase order "${poRef}" on ${p.code}.`);
      }
      const { db, changeId } = ctx.change();
      const inv = check(await db.from("supplier_invoices").insert({
        organization_id: ctx.studio.id, project_id: p.id, supplier_id: s?.id ?? null, purchase_order_id: poId, number: str(a, "number") ?? null,
        issued_on: date(a, "issued_on") ?? today(), due_on: date(a, "due_on") ?? null, net_amount: num(a, "net_amount", true), vat_amount: num(a, "vat_amount") ?? 0,
        category: oneOf(a, "category", CATEGORY_OUT)!,
      }).select("id, number, total").single());
      return done(changeId, { invoice: inv });
    },
  },
  {
    name: "record_payment",
    title: "Record a payment",
    description: "Record money paid out (direction out: labour, materials, extra; optionally against an invoice) or received from the client (direction in: client_works, client_fees).",
    writes: true,
    inputSchema: schema({
      project: P("Project code, id or name"), direction: P("out or in", "string", { enum: ["out", "in"] }), category: P("Category", "string", { enum: [...CATEGORY_OUT, ...CATEGORY_IN] }),
      amount: P("Amount", "number"), paid_on: P("Date YYYY-MM-DD (default today)"), concept: P("Concept"), invoice_id: P("Supplier invoice id it pays"), supplier: P("Supplier name or id"), method: P("transfer, card, cash…"),
    }, ["project", "direction", "category", "amount"]),
    run: async (a, ctx) => {
      const p = await project(ctx.db, str(a, "project", true));
      const direction = oneOf(a, "direction", ["out", "in"] as const)!;
      const category = oneOf(a, "category", direction === "out" ? CATEGORY_OUT : CATEGORY_IN)!;
      const sRef = str(a, "supplier");
      const s = sRef ? await supplier(ctx.db, sRef) : null;
      const { db, changeId } = ctx.change();
      const pay = check(await db.from("payments").insert({
        organization_id: ctx.studio.id, project_id: p.id, direction, category, amount: num(a, "amount", true), paid_on: date(a, "paid_on") ?? today(),
        concept: str(a, "concept") ?? null, invoice_id: str(a, "invoice_id") ?? null, supplier_id: s?.id ?? null, method: str(a, "method") ?? null,
      }).select("id, direction, category, amount, paid_on").single());
      return done(changeId, { payment: pay });
    },
  },
  {
    name: "undo_change",
    title: "Undo a change",
    description: "Revert every row of a change (by change_id from a change result or list_recent_changes). Refused if the rows were edited since.",
    writes: true,
    destructive: true,
    inputSchema: schema({ change_id: P("The change id") }, ["change_id"]),
    run: async (a, ctx) => {
      const { db, changeId } = ctx.change();
      const n = check(await db.rpc("undo_change", { p_change_id: str(a, "change_id", true) }));
      void changeId;
      return { undone_rows: n, undo_change_id: `undo:${str(a, "change_id", true)}` };
    },
  },
];

export const TOOLS: ToolDef[] = [...READ, ...WRITE];
