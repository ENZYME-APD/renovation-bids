import { createClient } from "@/lib/supabase/server";
import { getStudio } from "@/lib/dal";
import { exportResponse, jsonResponse, type Sheet } from "@/lib/export";
import { unitLabel } from "@/lib/format";

// Budget export: ?format=xlsx (lines + chapter summary) or ?format=csv (lines).
export async function GET(req: Request, ctx: RouteContext<"/projects/[id]/versions/[versionId]/export">) {
  const { id, versionId } = await ctx.params;
  const studio = await getStudio();
  if (!studio) return new Response("Not signed in", { status: 401 });
  const supabase = await createClient();
  const [{ data: project }, { data: version }, { data: lines }, { data: chapters }] = await Promise.all([
    supabase.from("projects").select("code, name").eq("id", id).maybeSingle(),
    supabase.from("versions").select("label, general_notes").eq("id", versionId).eq("project_id", id).maybeSingle(),
    supabase
      .from("line_items")
      .select("id, quantity, unit_price, total, confidence, state, room, notes, supplied_by, description, client_note, measurement_note, reference_price, reference_source, partidas(code, short_description, long_description, unit, trades(code, name, sequence)), line_measurements(label, count, length, width, height, partial, sequence)")
      .eq("version_id", versionId)
      .order("created_at"),
    supabase.rpc("version_budget", { p_version: versionId }),
  ]);
  if (!project || !version) return new Response("Not found", { status: 404 });

  type L = NonNullable<typeof lines>[number];
  const rows = [...(lines ?? [])].sort(
    (a, b) => (a.partidas?.trades?.sequence ?? 999) - (b.partidas?.trades?.sequence ?? 999) || (a.partidas?.code ?? "").localeCompare(b.partidas?.code ?? ""),
  );
  const num = (v: number | string | null) => (v == null ? null : Number(v));
  // The exchange format: edit it anywhere and import it back (rows keep their ID).
  const linesSheet: Sheet<L> = {
    name: "Lines",
    rows,
    columns: [
      { header: "ID", value: (l) => l.id, width: 38 },
      { header: "Chapter", value: (l) => (l.partidas?.trades ? `${l.partidas.trades.code ?? ""} ${l.partidas.trades.name}`.trim() : ""), width: 30 },
      { header: "Code", value: (l) => l.partidas?.code ?? "", width: 10 },
      { header: "Title", value: (l) => l.partidas?.short_description ?? "", width: 44 },
      { header: "Description", value: (l) => l.description ?? l.partidas?.long_description ?? null, width: 60 },
      { header: "Room", value: (l) => l.room, width: 20 },
      { header: "Unit", value: (l) => unitLabel[l.partidas?.unit ?? ""] ?? l.partidas?.unit ?? "", width: 6 },
      { header: "Quantity", value: (l) => Number(l.quantity), number: true },
      { header: "Unit price", value: (l) => num(l.unit_price), money: true, width: 12 },
      { header: "Total", value: (l) => num(l.total), money: true, width: 13 },
      { header: "Supplied by", value: (l) => l.supplied_by, width: 12 },
      { header: "Confidence", value: (l) => l.confidence },
      { header: "State", value: (l) => l.state },
      { header: "Client note", value: (l) => l.client_note, width: 30 },
      { header: "Measurement note", value: (l) => l.measurement_note, width: 30 },
      { header: "Internal note", value: (l) => l.notes, width: 30 },
      { header: "Reference price", value: (l) => num(l.reference_price), money: true, width: 12 },
      { header: "Reference source", value: (l) => l.reference_source, width: 20 },
    ],
  };
  type M = { line: L; m: NonNullable<L["line_measurements"]>[number] };
  const measRows: M[] = rows.flatMap((l) => [...(l.line_measurements ?? [])].sort((a, b) => a.sequence - b.sequence).map((m) => ({ line: l, m })));
  const measSheet: Sheet<M> = {
    name: "Measurements",
    rows: measRows,
    columns: [
      { header: "Line ID", value: (x) => x.line.id, width: 38 },
      { header: "Code", value: (x) => x.line.partidas?.code ?? "", width: 10 },
      { header: "Label", value: (x) => x.m.label, width: 40 },
      { header: "Count", value: (x) => num(x.m.count), number: true },
      { header: "Length", value: (x) => num(x.m.length), number: true },
      { header: "Width", value: (x) => num(x.m.width), number: true },
      { header: "Height", value: (x) => num(x.m.height), number: true },
      { header: "Partial", value: (x) => num(x.m.partial), number: true },
    ],
  };
  type C = NonNullable<typeof chapters>[number];
  const summary: Sheet<C> = {
    name: "By chapter",
    rows: chapters ?? [],
    columns: [
      { header: "Chapter", value: (c) => c.trade, width: 40 },
      { header: "Lines", value: (c) => Number(c.lines) },
      { header: "Priced", value: (c) => Number(c.priced_lines) },
      { header: "Subtotal", value: (c) => Number(c.subtotal), money: true, width: 14 },
      { header: "Low", value: (c) => Number(c.budget_low), money: true, width: 14 },
      { header: "High", value: (c) => Number(c.budget_high), money: true, width: 14 },
    ],
  };
  const format = new URL(req.url).searchParams.get("format");
  const base = `${project.code} ${project.name} v${version.label}`;
  if (format === "json") {
    const body = {
      format: "renovation-bids/budget@1",
      project: { code: project.code, name: project.name },
      version: version.label,
      general_notes: version.general_notes,
      lines: rows.map((l) => ({
        id: l.id, chapter: l.partidas?.trades?.code ?? null, code: l.partidas?.code, title: l.partidas?.short_description,
        description: l.description, room: l.room, unit: l.partidas?.unit, quantity: Number(l.quantity), unit_price: num(l.unit_price),
        total: num(l.total), supplied_by: l.supplied_by, confidence: l.confidence, state: l.state, client_note: l.client_note,
        measurement_note: l.measurement_note, notes: l.notes, reference_price: num(l.reference_price), reference_source: l.reference_source,
        measurements: [...(l.line_measurements ?? [])].sort((a, b) => a.sequence - b.sequence)
          .map((m) => ({ label: m.label, count: num(m.count), length: num(m.length), width: num(m.width), height: num(m.height) })),
      })),
    };
    return jsonResponse(base, body);
  }
  return exportResponse(format, base, [linesSheet, measSheet, summary], studio.currency);
}
