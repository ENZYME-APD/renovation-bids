import { createClient } from "@/lib/supabase/server";
import { getStudio } from "@/lib/dal";
import { exportResponse, type Sheet } from "@/lib/export";
import { unitLabel } from "@/lib/format";

// Budget export: ?format=xlsx (lines + chapter summary) or ?format=csv (lines).
export async function GET(req: Request, ctx: RouteContext<"/projects/[id]/versions/[versionId]/export">) {
  const { id, versionId } = await ctx.params;
  const studio = await getStudio();
  if (!studio) return new Response("Not signed in", { status: 401 });
  const supabase = await createClient();
  const [{ data: project }, { data: version }, { data: lines }, { data: chapters }] = await Promise.all([
    supabase.from("projects").select("code, name").eq("id", id).maybeSingle(),
    supabase.from("versions").select("label").eq("id", versionId).eq("project_id", id).maybeSingle(),
    supabase
      .from("line_items")
      .select("quantity, unit_price, total, confidence, state, room, notes, partidas(code, short_description, unit, trades(code, name, sequence))")
      .eq("version_id", versionId)
      .order("created_at"),
    supabase.rpc("version_budget", { p_version: versionId }),
  ]);
  if (!project || !version) return new Response("Not found", { status: 404 });

  type L = NonNullable<typeof lines>[number];
  const rows = [...(lines ?? [])].sort(
    (a, b) => (a.partidas?.trades?.sequence ?? 999) - (b.partidas?.trades?.sequence ?? 999) || (a.partidas?.code ?? "").localeCompare(b.partidas?.code ?? ""),
  );
  const linesSheet: Sheet<L> = {
    name: "Lines",
    rows,
    columns: [
      { header: "Chapter", value: (l) => (l.partidas?.trades ? `${l.partidas.trades.code ?? ""} ${l.partidas.trades.name}`.trim() : ""), width: 34 },
      { header: "Code", value: (l) => l.partidas?.code ?? "", width: 10 },
      { header: "Description", value: (l) => l.partidas?.short_description ?? "", width: 48 },
      { header: "Room", value: (l) => l.room, width: 22 },
      { header: "Unit", value: (l) => unitLabel[l.partidas?.unit ?? ""] ?? l.partidas?.unit ?? "", width: 6 },
      { header: "Quantity", value: (l) => Number(l.quantity), number: true },
      { header: "Unit price", value: (l) => (l.unit_price == null ? null : Number(l.unit_price)), money: true, width: 12 },
      { header: "Total", value: (l) => (l.total == null ? null : Number(l.total)), money: true, width: 13 },
      { header: "Confidence", value: (l) => l.confidence },
      { header: "State", value: (l) => l.state },
      { header: "Notes", value: (l) => l.notes, width: 30 },
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
  return exportResponse(format, `${project.code} ${project.name} v${version.label}`, [linesSheet, summary], studio.currency);
}
