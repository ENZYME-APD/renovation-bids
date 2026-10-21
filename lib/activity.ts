import type { Database } from "@/lib/database.types";

export type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];

const TABLES: Record<string, string> = {
  organizations: "studio settings", members: "team member", invitations: "invitation",
  clients: "client", projects: "project", site_visits: "site visit", versions: "version",
  decisions: "client request", suppliers: "supplier", supplier_trades: "supplier trade",
  rfqs: "supplier request", rfq_line_items: "line in a supplier request", quotes: "quote",
  prices: "price", line_items: "budget line", offers: "offer", trades: "chapter",
  partidas: "partida", room_templates: "room template", rooms: "room", purchase_orders: "purchase order",
  purchase_order_lines: "purchase line", supplier_invoices: "supplier invoice", payments: "payment",
};

const VERBS = { insert: "added", update: "changed", delete: "removed" } as const;

function labelOf(row: Record<string, unknown> | null): string | null {
  if (!row) return null;
  for (const k of ["code", "name", "label", "short_description", "number", "concept", "email", "request", "notes"]) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.length > 60 ? v.slice(0, 57) + "…" : v;
  }
  return null;
}

export function describe(e: ActivityRow): string {
  const thing = TABLES[e.table_name] ?? e.table_name.replace(/_/g, " ");
  const label = labelOf((e.new_row ?? e.old_row) as Record<string, unknown> | null);
  const fields = e.action === "update" && e.changed_fields?.length ? ` (${e.changed_fields.join(", ").replace(/_/g, " ")})` : "";
  return `${VERBS[e.action as keyof typeof VERBS] ?? e.action} ${thing}${label ? ` “${label}”` : ""}${fields}`;
}

export function sourceLabel(e: Pick<ActivityRow, "source">) {
  return e.source === "ai" ? "AI assistant" : e.source === "system" ? "Automatic" : "App";
}

/** Group log rows (newest first) into changes, one per change id. */
export function groupChanges(rows: ActivityRow[]) {
  const groups = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    if (!groups.has(r.change_id)) groups.set(r.change_id, []);
    groups.get(r.change_id)!.push(r);
  }
  return [...groups.entries()].map(([changeId, items]) => ({
    changeId,
    items,
    at: items[0].occurred_at,
    actor: items[0].actor_email,
    actorId: items[0].actor_id,
    source: items[0].source,
    undone: items.every((i) => i.undone_at),
    isUndo: changeId.startsWith("undo:"),
  }));
}
